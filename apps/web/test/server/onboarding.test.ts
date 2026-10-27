import { beforeEach, describe, expect, it } from 'vitest'
import { eq, users } from '@piston/db'
import getRoute from '../../server/api/onboarding.get'
import dismissRoute from '../../server/api/onboarding/dismiss.post'
import resetRoute from '../../server/api/onboarding.delete'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

const dismissed = async () =>
  (
    (await (await callRoute(getRoute, { path: '/api/onboarding' })).json()) as {
      dismissed: string[]
    }
  ).dismissed

const dismiss = (hint: string) =>
  callRoute(dismissRoute, { method: 'POST', path: '/api/onboarding/dismiss', body: { hint } })

describe('onboarding', () => {
  it('starts with nothing closed, and remembers closed messages once each', async () => {
    await loginAsNewUser()
    expect(await dismissed()).toEqual([])
    expect((await dismiss('welcome')).status).toBe(200)
    expect((await dismiss('offres')).status).toBe(200)
    expect((await dismiss('welcome')).status).toBe(200)
    expect(await dismissed()).toEqual(['welcome', 'offres'])
  })

  it('rejects unknown messages and ignores stale ids stored by older releases', async () => {
    const { user } = await loginAsNewUser()
    expect((await dismiss('nope')).status).toBe(400)
    await testState.db
      .update(users)
      .set({ dismissedHints: ['old-tip', 'cv'] })
      .where(eq(users.id, user.id))
    expect(await dismissed()).toEqual(['cv'])
  })

  it('« Revoir l’introduction » shows everything again', async () => {
    await loginAsNewUser()
    await dismiss('welcome')
    expect(
      (await callRoute(resetRoute, { method: 'DELETE', path: '/api/onboarding' })).status,
    ).toBe(200)
    expect(await dismissed()).toEqual([])
  })

  it('is per user and needs a session', async () => {
    await loginAsNewUser('a@example.com')
    await dismiss('welcome')
    await loginAsNewUser('b@example.com')
    expect(await dismissed()).toEqual([])
    testState.user = null
    expect((await dismiss('welcome')).status).toBe(401)
  })
})
