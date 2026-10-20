import { beforeEach, describe, expect, it } from 'vitest'
import { generations, users } from '@piston/db'
import type { Generation, Paginated } from '@piston/shared'
import listRoute from '../../server/api/generations.get'
import oneRoute from '../../server/api/generations/[id].get'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

function insertGeneration(
  userId: string,
  kind: 'resume_review' | 'search_leads',
  createdAt = new Date(),
) {
  return testState.db
    .insert(generations)
    .values({ userId, kind, output: {} as never, model: 'm', createdAt })
    .returning()
    .then(([row]) => row!)
}

const list = async (query = '') => {
  const res = await callRoute(listRoute, { path: `/api/generations${query}` })
  return (await res.json()) as Paginated<Generation>
}

describe('GET /api/generations', () => {
  it('paginates, newest first', async () => {
    const { user } = await loginAsNewUser()
    for (let i = 0; i < 5; i++)
      await insertGeneration(user.id, 'resume_review', new Date(Date.UTC(2026, 0, i + 1, 12)))

    const first = await list('?pageSize=2')
    expect(first).toMatchObject({ page: 1, pageSize: 2, total: 5 })
    expect(first.items.map((g) => g.createdAt.slice(0, 10))).toEqual(['2026-01-05', '2026-01-04'])

    const last = await list('?pageSize=2&page=3')
    expect(last.items).toHaveLength(1)
  })

  it('filters by kind', async () => {
    const { user } = await loginAsNewUser()
    await insertGeneration(user.id, 'resume_review')
    await insertGeneration(user.id, 'search_leads')

    const result = await list('?kind=search_leads')
    expect(result.total).toBe(1)
    expect(result.items[0]!.kind).toBe('search_leads')
  })

  it('rejects an invalid query', async () => {
    await loginAsNewUser()
    const res = await callRoute(listRoute, { path: '/api/generations?kind=nope' })
    expect(res.status).toBe(400)
  })

  it('only returns the current user generations', async () => {
    const { user } = await loginAsNewUser()
    const [other] = await testState.db
      .insert(users)
      .values({ email: 'other@example.com', displayName: 'Autre', passwordHash: 'x' })
      .returning()
    await insertGeneration(user.id, 'resume_review')
    await insertGeneration(other!.id, 'resume_review')

    expect((await list()).total).toBe(1)
  })
})

describe('GET /api/generations/:id', () => {
  const get = (id: string) =>
    callRoute(oneRoute, { path: `/api/generations/${id}`, route: '/api/generations/:id' })

  it('returns an own generation', async () => {
    const { user } = await loginAsNewUser()
    const row = await insertGeneration(user.id, 'search_leads')
    const res = await get(row.id)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: row.id, kind: 'search_leads' })
  })

  it("answers 404 for another user's generation", async () => {
    await loginAsNewUser()
    const [other] = await testState.db
      .insert(users)
      .values({ email: 'other@example.com', displayName: 'Autre', passwordHash: 'x' })
      .returning()
    const row = await insertGeneration(other!.id, 'search_leads')
    expect((await get(row.id)).status).toBe(404)
  })
})
