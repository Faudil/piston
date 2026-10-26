import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authAttempts, eq, users } from '@piston/db'
import loginRoute from '../../server/api/auth/login.post'
import registerRoute from '../../server/api/auth/register.post'
import passwordRoute from '../../server/api/account/password.post'
import checkInviteRoute from '../../server/api/invites/[token].get'
import createInviteRoute from '../../server/api/invites.post'
import healthRoute from '../../server/api/health.get'
import { buildCsp } from '../../server/utils/security-headers'
import { describeError, hashUserId, redactPath } from '../../server/utils/logger'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

const forwardedFor = (ip: string) => ({ 'x-forwarded-for': ip })

async function login(email: string, password: string, headers: Record<string, string> = {}) {
  return callRoute(loginRoute, {
    method: 'POST',
    path: '/api/auth/login',
    body: { email, password },
    headers,
  })
}

describe('login throttling', () => {
  it('locks an e-mail after 10 failures, even for the right password', async () => {
    await loginAsNewUser('target@example.com')
    testState.user = null
    for (let i = 0; i < 10; i++) {
      expect((await login('target@example.com', `wrong-password-${i}`)).status).toBe(401)
    }
    const locked = await login('target@example.com', 'password123')
    expect(locked.status).toBe(429)
    expect(await locked.json()).toMatchObject({
      message: 'Trop de tentatives, réessaie dans quelques minutes.',
    })
    expect(testState.user).toBeNull()
  })

  it('only counts failures of the last 15 minutes', async () => {
    await loginAsNewUser('target@example.com')
    testState.user = null
    const old = new Date(Date.now() - 16 * 60 * 1000)
    await testState.db.insert(authAttempts).values(
      Array.from({ length: 10 }, () => ({
        bucket: 'login-email:target@example.com',
        createdAt: old,
      })),
    )
    expect((await login('target@example.com', 'password123')).status).toBe(200)
  })

  it('a successful login resets the e-mail counter', async () => {
    await loginAsNewUser('target@example.com')
    testState.user = null
    for (let i = 0; i < 9; i++) await login('target@example.com', 'nope-nope-nope')
    expect((await login('target@example.com', 'password123')).status).toBe(200)
    for (let i = 0; i < 9; i++) {
      expect((await login('target@example.com', 'nope-nope-nope')).status).toBe(401)
    }
  })

  it('locks an IP after 30 failures across different e-mails', async () => {
    testState.config.trustProxy = true
    for (let i = 0; i < 30; i++) {
      expect(
        (await login(`user${i}@example.com`, 'wrong-password', forwardedFor('198.51.100.7')))
          .status,
      ).toBe(401)
    }
    expect(
      (await login('fresh@example.com', 'wrong-password', forwardedFor('198.51.100.7'))).status,
    ).toBe(429)
    // Another address is unaffected.
    expect(
      (await login('fresh@example.com', 'wrong-password', forwardedFor('198.51.100.8'))).status,
    ).toBe(401)
  })

  it('uses the address added by the proxy (last entry), not one the client claims', async () => {
    testState.config.trustProxy = true
    for (let i = 0; i < 30; i++) {
      // The client invents a new first entry each time; the proxy always appends the real one.
      await login(
        `user${i}@example.com`,
        'wrong-password',
        forwardedFor(`10.0.0.${i}, 203.0.113.9`),
      )
    }
    const res = await login(
      'fresh@example.com',
      'wrong-password',
      forwardedFor('10.9.9.9, 203.0.113.9'),
    )
    expect(res.status).toBe(429)
  })

  it('ignores X-Forwarded-For when the proxy is not trusted', async () => {
    testState.config.trustProxy = false
    for (let i = 0; i < 30; i++) {
      await login(`user${i}@example.com`, 'wrong-password', forwardedFor(`10.0.0.${i}`))
    }
    // All attempts share one bucket whatever the header says.
    const res = await login('fresh@example.com', 'wrong-password', forwardedFor('10.9.9.9'))
    expect(res.status).toBe(429)
  })
})

describe('sign-up and invitation throttling', () => {
  it('locks an IP after 10 sign-ups with an unusable invitation', async () => {
    testState.config.trustProxy = true
    const attempt = (token: string) =>
      callRoute(registerRoute, {
        method: 'POST',
        path: '/api/auth/register',
        headers: forwardedFor('198.51.100.20'),
        body: { token, email: 'a@example.com', displayName: 'A', password: 'a-long-password' },
      })
    for (let i = 0; i < 10; i++) expect((await attempt(`guess-${i}`)).status).toBe(400)
    const locked = await attempt('guess-11')
    expect(locked.status).toBe(429)
    expect(await locked.json()).toMatchObject({
      message: expect.stringContaining('Trop de tentatives'),
    })
  })

  it('limits invitation link checks per IP', async () => {
    testState.config.trustProxy = true
    const check = () =>
      callRoute(checkInviteRoute, {
        path: '/api/invites/abc',
        route: '/api/invites/:token',
        headers: forwardedFor('198.51.100.30'),
      })
    for (let i = 0; i < 60; i++) expect((await check()).status).toBe(200)
    expect((await check()).status).toBe(429)
  })
})

describe('logout everywhere on password change', () => {
  it('rejects sessions issued before the change and keeps the current one', async () => {
    const { user } = await loginAsNewUser()
    const res = await callRoute(passwordRoute, {
      method: 'POST',
      path: '/api/account/password',
      body: { currentPassword: 'password123', newPassword: 'another-long-password' },
    })
    expect(res.status).toBe(200)
    const [row] = await testState.db.select().from(users).where(eq(users.id, user.id))
    expect(row!.sessionVersion).toBe(1)

    // This device was re-issued a session carrying the new version...
    expect(testState.sessionVersion).toBe(1)
    const ok = await callRoute(createInviteRoute, { method: 'POST', path: '/api/invites' })
    expect(ok.status).toBe(200)

    // ...an older cookie (version 0, e.g. another browser) is refused.
    testState.sessionVersion = 0
    const stale = await callRoute(createInviteRoute, { method: 'POST', path: '/api/invites' })
    expect(stale.status).toBe(401)
    expect(testState.user).toBeNull()
  })

  it('rejects a session whose user no longer exists', async () => {
    const { user } = await loginAsNewUser()
    await testState.db.delete(users).where(eq(users.id, user.id))
    const res = await callRoute(createInviteRoute, { method: 'POST', path: '/api/invites' })
    expect(res.status).toBe(401)
  })
})

describe('health', () => {
  it('reports the database and the disk', async () => {
    const res = await callRoute(healthRoute, { path: '/api/health' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      status: expect.stringMatching(/ok|degraded/),
      db: 'ok',
    })
  })

  it('answers 503 when the database is down', async () => {
    const spy = vi.spyOn(testState.db, 'execute').mockRejectedValueOnce(new Error('down'))
    const res = await callRoute(healthRoute, { path: '/api/health' })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ status: 'down', db: 'down' })
    spy.mockRestore()
  })
})

describe('logging helpers', () => {
  it('redacts opaque tokens but keeps ids and words', () => {
    expect(redactPath('/api/partage/Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MA/info')).toBe(
      '/api/partage/:token/info',
    )
    expect(redactPath('/api/offers/6f1c2f0e-8b5d-4f43-9c0e-5a9d2f6a1b3c')).toBe(
      '/api/offers/6f1c2f0e-8b5d-4f43-9c0e-5a9d2f6a1b3c',
    )
  })

  it('keeps one line of an error message, never its SQL parameters', () => {
    const error = Object.assign(
      new Error('Failed query: insert into "x" values ($1)\nparams: secret cv text'),
      {
        cause: { code: '23505' },
      },
    )
    const described = describeError(error)
    expect(described.message).not.toContain('secret')
    expect(described.code).toBe('23505')
  })

  it('hashes user ids with a keyed, stable pseudonym', () => {
    expect(hashUserId('u1', 'k')).toHaveLength(12)
    expect(hashUserId('u1', 'k')).toBe(hashUserId('u1', 'k'))
    expect(hashUserId('u1', 'k')).not.toBe(hashUserId('u1', 'other'))
  })
})

describe('content security policy', () => {
  it('allows only same-origin scripts and the request nonce, and forbids framing', () => {
    const csp = buildCsp('abc123', false)
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'wasm-unsafe-eval'")
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("img-src 'self' data: blob:")
    expect(csp).toContain("worker-src 'self' blob:")
  })

  it('puts the nonce on every inline script of a rendered page', async () => {
    let hook: (
      html: Record<string, string[]>,
      ctx: { event: { context: { cspNonce?: string } } },
    ) => void = () => {}
    vi.stubGlobal('defineNitroPlugin', (plugin: (app: unknown) => void) =>
      plugin({ hooks: { hook: (_name: string, fn: typeof hook) => (hook = fn) } }),
    )
    await import('../../server/plugins/csp-nonce')
    const html = {
      head: ['<script type="module" src="/a.js"></script>'],
      bodyPrepend: [],
      body: ['<script>window.__NUXT__={}</script>'],
      bodyAppend: [],
    }
    hook(html, { event: { context: { cspNonce: 'n0nce' } } })
    expect(html.head[0]).toContain('<script nonce="n0nce" type="module"')
    expect(html.body[0]).toBe('<script nonce="n0nce">window.__NUXT__={}</script>')
  })
})
