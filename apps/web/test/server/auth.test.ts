import { beforeEach, describe, expect, it } from 'vitest'
import { eq, invites, users } from '@piston/db'
import loginRoute from '../../server/api/auth/login.post'
import registerRoute from '../../server/api/auth/register.post'
import createInviteRoute from '../../server/api/invites.post'
import checkInviteRoute from '../../server/api/invites/[token].get'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

async function inviteToken() {
  await loginAsNewUser('host@example.com')
  const res = await callRoute(createInviteRoute, { method: 'POST', path: '/api/invites' })
  const { url } = (await res.json()) as { url: string }
  testState.user = null
  return url.split('/invite/')[1]!
}

describe('auth', () => {
  it('rejects protected routes without a session', async () => {
    const res = await callRoute(createInviteRoute, { method: 'POST', path: '/api/invites' })
    expect(res.status).toBe(401)
  })

  it('creates an account from a valid invite, only once', async () => {
    const token = await inviteToken()
    const check = await callRoute(checkInviteRoute, {
      path: `/api/invites/${token}`,
      route: '/api/invites/:token',
    })
    expect(await check.json()).toMatchObject({ valid: true })

    const body = {
      token,
      email: 'New@Example.com',
      displayName: 'Nouvelle',
      password: 'a-long-password',
    }
    const res = await callRoute(registerRoute, { method: 'POST', path: '/api/auth/register', body })
    expect(res.status).toBe(200)
    expect(testState.user?.email).toBe('new@example.com')

    const again = await callRoute(registerRoute, {
      method: 'POST',
      path: '/api/auth/register',
      body: { ...body, email: 'other@example.com' },
    })
    expect(again.status).toBe(400)
  })

  it('refuses expired invites', async () => {
    const token = await inviteToken()
    await testState.db
      .update(invites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invites.token, token))
    const res = await callRoute(registerRoute, {
      method: 'POST',
      path: '/api/auth/register',
      body: { token, email: 'x@example.com', displayName: 'X', password: 'a-long-password' },
    })
    expect(res.status).toBe(400)
    expect(
      await testState.db.select().from(users).where(eq(users.email, 'x@example.com')),
    ).toHaveLength(0)
  })

  it('logs in with the right password only', async () => {
    await loginAsNewUser('me@example.com')
    testState.user = null

    const bad = await callRoute(loginRoute, {
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'me@example.com', password: 'wrong' },
    })
    expect(bad.status).toBe(401)

    const good = await callRoute(loginRoute, {
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'ME@example.com', password: 'password123' },
    })
    expect(good.status).toBe(200)
    expect(testState.user?.email).toBe('me@example.com')
  })
})

describe('error responses', () => {
  it('carry the French message', async () => {
    const res = await callRoute(createInviteRoute, { method: 'POST', path: '/api/invites' })
    expect(await res.json()).toMatchObject({
      statusCode: 401,
      message: 'Connecte-toi pour continuer.',
    })
  })
})
