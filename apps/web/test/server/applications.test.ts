import { beforeEach, describe, expect, it } from 'vitest'
import { jobOffers } from '@piston/db'
import type { Application } from '@piston/shared'
import listRoute from '../../server/api/applications.get'
import createRoute from '../../server/api/applications.post'
import patchRoute from '../../server/api/applications/[id].patch'
import deleteRoute from '../../server/api/applications/[id].delete'
import { applyStatusChange } from '../../server/utils/applications'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

async function insertOffer(userId: string, title = 'Dev Vue') {
  const [offer] = await testState.db
    .insert(jobOffers)
    .values({ userId, title, company: 'Acme', rawText: 'Offre' })
    .returning()
  return offer!
}

const create = (jobOfferId: string) =>
  callRoute(createRoute, { method: 'POST', path: '/api/applications', body: { jobOfferId } })

const patch = (id: string, body: unknown) =>
  callRoute(patchRoute, {
    method: 'PATCH',
    path: `/api/applications/${id}`,
    route: '/api/applications/:id',
    body,
  })

async function createdApplication() {
  const { user } = await loginAsNewUser()
  const offer = await insertOffer(user.id)
  const app = (await (await create(offer.id)).json()) as Application
  return { user, offer, app }
}

describe('POST /api/applications', () => {
  it('creates a to_send application with one history entry', async () => {
    const { user } = await loginAsNewUser()
    const offer = await insertOffer(user.id)
    const res = await create(offer.id)
    expect(res.status).toBe(201)
    const app = (await res.json()) as Application
    expect(app.status).toBe('to_send')
    expect(app.outcome).toBeNull()
    expect(app.offer).toEqual({ id: offer.id, title: 'Dev Vue', company: 'Acme' })
    expect(app.statusHistory).toHaveLength(1)
    expect(app.statusHistory[0]!.status).toBe('to_send')
  })

  it('returns 409 when the offer already has an application', async () => {
    const { user } = await loginAsNewUser()
    const offer = await insertOffer(user.id)
    await create(offer.id)
    const res = await create(offer.id)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { message: string }).message).toBe(
      'Cette offre est déjà dans tes candidatures.',
    )
  })

  it("returns 404 for another user's offer", async () => {
    const { user: owner } = await loginAsNewUser('owner@example.com')
    const offer = await insertOffer(owner.id)
    await loginAsNewUser('other@example.com')
    expect((await create(offer.id)).status).toBe(404)
  })
})

describe('PATCH /api/applications/:id', () => {
  it('appends a dated history entry when the status changes', async () => {
    const { app } = await createdApplication()
    const res = await patch(app.id, { status: 'sent' })
    const updated = (await res.json()) as Application
    expect(updated.status).toBe('sent')
    expect(updated.statusHistory).toHaveLength(2)
    expect(updated.statusHistory[1]!.status).toBe('sent')
    expect(Number.isNaN(Date.parse(updated.statusHistory[1]!.at))).toBe(false)
  })

  it('does not append history when the status is unchanged', async () => {
    const { app } = await createdApplication()
    const updated = (await (
      await patch(app.id, { status: 'to_send', notes: 'Hello' })
    ).json()) as Application
    expect(updated.statusHistory).toHaveLength(1)
    expect(updated.notes).toBe('Hello')
  })

  it('accepts an outcome only on closed, and resets it when leaving closed', async () => {
    const { app } = await createdApplication()
    expect((await patch(app.id, { outcome: 'accepted' })).status).toBe(400)

    const closed = (await (
      await patch(app.id, { status: 'closed', outcome: 'rejected' })
    ).json()) as Application
    expect(closed.outcome).toBe('rejected')

    const reopened = (await (await patch(app.id, { status: 'interview' })).json()) as Application
    expect(reopened.outcome).toBeNull()
  })

  it('updates notes only', async () => {
    const { app } = await createdApplication()
    const updated = (await (await patch(app.id, { notes: 'Rappeler lundi' })).json()) as Application
    expect(updated.notes).toBe('Rappeler lundi')
    expect(updated.status).toBe('to_send')
  })

  it('rejects an empty body', async () => {
    const { app } = await createdApplication()
    expect((await patch(app.id, {})).status).toBe(400)
  })
})

describe('user isolation', () => {
  it('lists only own applications and 404s on others', async () => {
    const { app } = await createdApplication()
    await loginAsNewUser('other@example.com')

    const list = (await (
      await callRoute(listRoute, { path: '/api/applications' })
    ).json()) as Application[]
    expect(list).toEqual([])
    expect((await patch(app.id, { status: 'sent' })).status).toBe(404)
    const del = await callRoute(deleteRoute, {
      method: 'DELETE',
      path: `/api/applications/${app.id}`,
      route: '/api/applications/:id',
    })
    expect(del.status).toBe(404)
  })

  it('lists applications with their offer, newest update first', async () => {
    const { user, app } = await createdApplication()
    const second = (await (
      await create((await insertOffer(user.id, 'Autre')).id)
    ).json()) as Application
    await patch(app.id, { notes: 'touché' })
    const list = (await (
      await callRoute(listRoute, { path: '/api/applications' })
    ).json()) as Application[]
    expect(list.map((a) => a.id)).toEqual([app.id, second.id])
    expect(list[1]!.offer.title).toBe('Autre')
  })
})

describe('applyStatusChange', () => {
  const now = new Date('2026-01-02T10:00:00Z')
  const current = {
    status: 'sent' as const,
    outcome: null,
    notes: '',
    statusHistory: [{ status: 'sent' as const, at: '2026-01-01T00:00:00.000Z' }],
  }

  it('appends history on change, with the given date', () => {
    const next = applyStatusChange(current, { status: 'interview' }, now)
    expect(next.statusHistory.at(-1)).toEqual({ status: 'interview', at: now.toISOString() })
  })

  it('keeps history untouched when unchanged', () => {
    const next = applyStatusChange(current, { notes: 'x' }, now)
    expect(next.statusHistory).toBe(current.statusHistory)
  })

  it('sets and clears the outcome around closed', () => {
    const closed = applyStatusChange(current, { status: 'closed', outcome: 'accepted' }, now)
    expect(closed.outcome).toBe('accepted')
    expect(applyStatusChange(closed, { status: 'follow_up' }, now).outcome).toBeNull()
    expect(() => applyStatusChange(current, { outcome: 'accepted' }, now)).toThrow()
  })
})
