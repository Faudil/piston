import { beforeEach, describe, expect, it } from 'vitest'
import { accessRequests, apiUsage, eq, invites, users } from '@piston/db'
import type { AdminAccessRequest, AdminInvite, AdminOverview, AdminUser } from '@piston/shared'
import requestRoute from '../../server/api/access-requests.post'
import loginRoute from '../../server/api/auth/login.post'
import overviewRoute from '../../server/api/admin/overview.get'
import listRequestsRoute from '../../server/api/admin/access-requests.get'
import approveRoute from '../../server/api/admin/access-requests/[id]/approve.post'
import rejectRoute from '../../server/api/admin/access-requests/[id]/reject.post'
import usersRoute from '../../server/api/admin/users.get'
import patchUserRoute from '../../server/api/admin/users/[id].patch'
import deleteUserRoute from '../../server/api/admin/users/[id].delete'
import resetPasswordRoute from '../../server/api/admin/users/[id]/reset-password.post'
import invitesRoute from '../../server/api/admin/invites.get'
import createInviteRoute from '../../server/api/admin/invites.post'
import revokeInviteRoute from '../../server/api/admin/invites/[id].delete'
import pendingCountRoute from '../../server/api/admin/pending-count.get'
import { callRoute, insertOffer, loginAsNewUser, resetTestState, seedUsage } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

const requestBody = {
  email: 'Nouvelle@Example.com',
  displayName: 'Nadia',
  password: 'un-mot-de-passe',
  message: 'Je suis l’amie de Camille.',
}

const sendRequest = (body: object = requestBody, headers: Record<string, string> = {}) =>
  callRoute(requestRoute, { method: 'POST', path: '/api/access-requests', body, headers })

const login = (email: string, password: string) =>
  callRoute(loginRoute, { method: 'POST', path: '/api/auth/login', body: { email, password } })

/** Logs in a new user and grants them the admin role. */
async function loginAsAdmin(email = 'admin@example.com') {
  const { user } = await loginAsNewUser(email)
  await testState.db.update(users).set({ isAdmin: true }).where(eq(users.id, user.id))
  return user
}

const review = (id: string, action: 'approve' | 'reject') =>
  callRoute(action === 'approve' ? approveRoute : rejectRoute, {
    method: 'POST',
    path: `/api/admin/access-requests/${id}/${action}`,
    route: `/api/admin/access-requests/:id/${action}`,
  })

async function pendingRequestId() {
  const [row] = await testState.db.select().from(accessRequests)
  return row!.id
}

describe('access requests', () => {
  it('stores a pending request with a hashed password and no session', async () => {
    const response = await sendRequest()
    expect(response.status).toBe(200)
    const [row] = await testState.db.select().from(accessRequests)
    expect(row).toMatchObject({
      email: 'nouvelle@example.com',
      displayName: 'Nadia',
      message: 'Je suis l’amie de Camille.',
      status: 'pending',
      passwordHash: 'hashed:un-mot-de-passe',
    })
    expect(testState.user).toBeNull()
  })

  it('answers the same for a member or a duplicate, without storing anything', async () => {
    await loginAsNewUser('camille@example.com')
    testState.user = null
    expect((await sendRequest({ ...requestBody, email: 'camille@example.com' })).status).toBe(200)
    expect((await sendRequest()).status).toBe(200)
    expect((await sendRequest()).status).toBe(200)
    const rows = await testState.db.select().from(accessRequests)
    expect(rows.map((row) => row.email)).toEqual(['nouvelle@example.com'])
  })

  it('validates the form', async () => {
    const response = await sendRequest({ ...requestBody, password: 'court' })
    expect(response.status).toBe(400)
  })

  it('limits requests per IP', async () => {
    testState.config.trustProxy = true
    const headers = { 'x-forwarded-for': '203.0.113.9' }
    for (let i = 0; i < 5; i++) {
      expect(
        (await sendRequest({ ...requestBody, email: `p${i}@example.com` }, headers)).status,
      ).toBe(200)
    }
    expect((await sendRequest({ ...requestBody, email: 'p9@example.com' }, headers)).status).toBe(
      429,
    )
  })

  it('refuses new requests when too many are waiting', async () => {
    await testState.db.insert(accessRequests).values(
      Array.from({ length: 30 }, (_, i) => ({
        email: `spam${i}@example.com`,
        displayName: 'Spam',
        passwordHash: 'hashed:x',
      })),
    )
    expect((await sendRequest()).status).toBe(503)
  })

  it('tells a requester with the right password that the request is pending', async () => {
    await sendRequest()
    const pending = await login('nouvelle@example.com', 'un-mot-de-passe')
    expect(pending.status).toBe(403)
    expect(await pending.json()).toMatchObject({
      message: expect.stringContaining('en attente'),
    })
    expect((await login('nouvelle@example.com', 'mauvais-mot-de-passe')).status).toBe(401)
  })
})

describe('admin access', () => {
  it('refuses regular members, even with a forged session flag', async () => {
    await loginAsNewUser()
    testState.user = { ...testState.user!, isAdmin: true }
    for (const route of [overviewRoute, usersRoute, invitesRoute, listRequestsRoute]) {
      const response = await callRoute(route, { path: '/api/admin/overview' })
      expect(response.status).toBe(403)
    }
  })

  it('refuses anonymous calls', async () => {
    expect((await callRoute(overviewRoute, { path: '/api/admin/overview' })).status).toBe(401)
  })
})

describe('reviewing requests', () => {
  it('approving creates the account with the chosen password', async () => {
    await sendRequest()
    const admin = await loginAsAdmin()
    const id = await pendingRequestId()

    const counted = await callRoute(pendingCountRoute, { path: '/api/admin/pending-count' })
    expect(await counted.json()).toEqual({ pending: 1 })

    expect((await review(id, 'approve')).status).toBe(200)
    const created = await testState.db.query.users.findFirst({
      where: eq(users.email, 'nouvelle@example.com'),
    })
    expect(created).toMatchObject({
      displayName: 'Nadia',
      passwordHash: 'hashed:un-mot-de-passe',
      isAdmin: false,
    })
    const [row] = await testState.db.select().from(accessRequests)
    expect(row).toMatchObject({
      status: 'approved',
      passwordHash: null,
      reviewedBy: admin.id,
      userId: created!.id,
    })

    testState.user = null
    expect((await login('nouvelle@example.com', 'un-mot-de-passe')).status).toBe(200)
  })

  it('rejecting erases the password and a request is reviewed only once', async () => {
    await sendRequest()
    await loginAsAdmin()
    const id = await pendingRequestId()
    expect((await review(id, 'reject')).status).toBe(200)
    const [row] = await testState.db.select().from(accessRequests)
    expect(row).toMatchObject({ status: 'rejected', passwordHash: null })
    expect((await review(id, 'approve')).status).toBe(409)
    expect(await testState.db.query.users.findFirst({ where: eq(users.email, row!.email) })).toBe(
      undefined,
    )

    // A rejected address may ask again.
    testState.user = null
    await sendRequest()
    expect(await testState.db.select().from(accessRequests)).toHaveLength(2)
  })

  it('closes the request when the address got an account in the meantime', async () => {
    await sendRequest()
    await testState.db
      .insert(users)
      .values({ email: 'nouvelle@example.com', displayName: 'Nadia', passwordHash: 'hashed:autre' })
    await loginAsAdmin()
    const response = await review(await pendingRequestId(), 'approve')
    expect(response.status).toBe(409)
    const [row] = await testState.db.select().from(accessRequests)
    expect(row!.status).toBe('rejected')
  })

  it('lists requests, filtered by status', async () => {
    await sendRequest()
    await sendRequest({ ...requestBody, email: 'autre@example.com' })
    await loginAsAdmin()
    await review(await pendingRequestId(), 'reject')

    const all = (await (
      await callRoute(listRequestsRoute, { path: '/api/admin/access-requests' })
    ).json()) as AdminAccessRequest[]
    expect(all).toHaveLength(2)
    expect(all.find((request) => request.status === 'rejected')?.reviewedBy).toBe('Camille')

    const pending = (await (
      await callRoute(listRequestsRoute, { path: '/api/admin/access-requests?status=pending' })
    ).json()) as AdminAccessRequest[]
    expect(pending).toHaveLength(1)
    expect(pending[0]).not.toHaveProperty('passwordHash')
  })
})

describe('members', () => {
  const memberRoute = (handler: typeof patchUserRoute, method: string, id: string, body?: object) =>
    callRoute(handler, {
      method,
      path: `/api/admin/users/${id}`,
      route: '/api/admin/users/:id',
      body,
    })

  it('lists members with their activity', async () => {
    const { user: member } = await loginAsNewUser('membre@example.com')
    await insertOffer(member.id)
    await seedUsage(member.id, 3, { estimatedCostMicros: 50_000 })
    await seedUsage(member.id, 2, { provider: 'tavily', operation: 'search' })
    await loginAsAdmin()

    const list = (await (
      await callRoute(usersRoute, { path: '/api/admin/users' })
    ).json()) as AdminUser[]
    expect(list).toHaveLength(2)
    const row = list.find((entry) => entry.email === 'membre@example.com')!
    expect(row).toMatchObject({
      isAdmin: false,
      counts: { offers: 1, applications: 0, cvDocuments: 0, generations: 0 },
      claude30d: { calls: 3, costUsd: 0.15 },
      web30d: { calls: 2 },
    })
    expect(row.lastActiveAt).not.toBeNull()
    expect(list.find((entry) => entry.email === 'admin@example.com')!.lastActiveAt).toBeNull()
  })

  it('grants and removes the admin role, but never one’s own', async () => {
    const { user: member } = await loginAsNewUser('membre@example.com')
    const admin = await loginAsAdmin()

    expect((await memberRoute(patchUserRoute, 'PATCH', member.id, { isAdmin: true })).status).toBe(
      200,
    )
    const updated = await testState.db.query.users.findFirst({ where: eq(users.id, member.id) })
    expect(updated!.isAdmin).toBe(true)

    expect((await memberRoute(patchUserRoute, 'PATCH', admin.id, { isAdmin: false })).status).toBe(
      400,
    )
  })

  it('resets a password and closes the member’s sessions', async () => {
    const { user: member } = await loginAsNewUser('membre@example.com')
    await loginAsAdmin()
    const response = await callRoute(resetPasswordRoute, {
      method: 'POST',
      path: `/api/admin/users/${member.id}/reset-password`,
      route: '/api/admin/users/:id/reset-password',
    })
    const { password } = (await response.json()) as { password: string }
    expect(password).toHaveLength(20)
    const updated = await testState.db.query.users.findFirst({ where: eq(users.id, member.id) })
    expect(updated).toMatchObject({ passwordHash: `hashed:${password}`, sessionVersion: 1 })
  })

  it('deletes another member, not oneself; their usage stays counted', async () => {
    const { user: member } = await loginAsNewUser('membre@example.com')
    await seedUsage(member.id, 2)
    const admin = await loginAsAdmin()

    expect((await memberRoute(deleteUserRoute, 'DELETE', admin.id)).status).toBe(400)
    expect((await memberRoute(deleteUserRoute, 'DELETE', member.id)).status).toBe(200)
    expect(await testState.db.query.users.findFirst({ where: eq(users.id, member.id) })).toBe(
      undefined,
    )
    expect(await testState.db.select().from(apiUsage)).toHaveLength(2)
  })
})

describe('invitations', () => {
  it('creates links outside the weekly quota, lists and revokes them', async () => {
    await loginAsAdmin()
    for (let i = 0; i < 7; i++) {
      const response = await callRoute(createInviteRoute, {
        method: 'POST',
        path: '/api/admin/invites',
      })
      expect(response.status).toBe(200)
    }
    await testState.db
      .update(invites)
      .set({ usedAt: new Date() })
      .where(eq(invites.id, (await testState.db.select().from(invites))[0]!.id))

    const list = (await (
      await callRoute(invitesRoute, { path: '/api/admin/invites' })
    ).json()) as AdminInvite[]
    expect(list).toHaveLength(7)
    expect(list.filter((invite) => invite.status === 'used')).toHaveLength(1)
    expect(list[0]!.createdBy).toBe('Camille')
    expect(list[0]).not.toHaveProperty('token')

    const used = list.find((invite) => invite.status === 'used')!
    const active = list.find((invite) => invite.status === 'active')!
    const revoke = (id: string) =>
      callRoute(revokeInviteRoute, {
        method: 'DELETE',
        path: `/api/admin/invites/${id}`,
        route: '/api/admin/invites/:id',
      })
    expect((await revoke(active.id)).status).toBe(200)
    expect((await revoke(used.id)).status).toBe(404)
    expect(await testState.db.select().from(invites)).toHaveLength(6)
  })
})

describe('overview', () => {
  it('sums members, content and spending', async () => {
    const { user: member } = await loginAsNewUser('membre@example.com')
    await insertOffer(member.id)
    await seedUsage(member.id, 4, { estimatedCostMicros: 250_000, operation: 'cover_letter' })
    await seedUsage(member.id, 1, { provider: 'tavily', operation: 'search', credits: 1 })
    await sendRequest()
    await loginAsAdmin()

    const overview = (await (
      await callRoute(overviewRoute, { path: '/api/admin/overview' })
    ).json()) as AdminOverview
    expect(overview.totals).toMatchObject({
      users: 2,
      admins: 1,
      activeUsers7d: 1,
      pendingRequests: 1,
      offers: 1,
    })
    expect(overview.claude.today).toEqual({ calls: 4, limit: 300 })
    expect(overview.claude.month).toEqual({ costUsd: 1, budgetUsd: 25, calls: 4 })
    expect(overview.claude.byOperation).toEqual([
      { operation: 'cover_letter', calls: 4, costUsd: 1 },
    ])
    expect(overview.web.month).toMatchObject({ credits: 1, calls: 1 })
    expect(overview.daily).toHaveLength(30)
    expect(overview.daily.at(-1)).toMatchObject({ claudeCalls: 4, claudeCostUsd: 1, webCalls: 1 })
  })
})
