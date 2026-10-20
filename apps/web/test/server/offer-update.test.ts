import { beforeEach, describe, expect, it } from 'vitest'
import { jobOffers } from '@piston/db'
import type { JobOffer } from '@piston/shared'
import createRoute from '../../server/api/offers.post'
import patchRoute from '../../server/api/offers/[id].patch'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

async function createOffer() {
  const res = await callRoute(createRoute, {
    method: 'POST',
    path: '/api/offers',
    body: { title: 'Dev', company: 'Acme', rawText: 'Texte', url: 'https://example.com/job' },
  })
  return (await res.json()) as JobOffer
}

const patch = (id: string, body: unknown) =>
  callRoute(patchRoute, {
    method: 'PATCH',
    path: `/api/offers/${id}`,
    route: '/api/offers/:id',
    body,
  })

describe('PATCH /api/offers/:id', () => {
  it('changes only the given fields', async () => {
    await loginAsNewUser()
    const offer = await createOffer()
    const res = await patch(offer.id, { title: 'Lead dev' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      title: 'Lead dev',
      company: 'Acme',
      rawText: 'Texte',
      url: 'https://example.com/job',
    })
  })

  it('clears the url with an empty string', async () => {
    await loginAsNewUser()
    const offer = await createOffer()
    expect(await (await patch(offer.id, { url: '' })).json()).toMatchObject({ url: null })
  })

  it('validates the body', async () => {
    await loginAsNewUser()
    const offer = await createOffer()
    expect((await patch(offer.id, {})).status).toBe(400)
    expect((await patch(offer.id, { title: '  ' })).status).toBe(400)
    expect((await patch(offer.id, { url: 'pas une url' })).status).toBe(400)
  })

  it("returns 404 for another user's offer and leaves it untouched", async () => {
    await loginAsNewUser('alice@example.com')
    const offer = await createOffer()
    await loginAsNewUser('bob@example.com')
    expect((await patch(offer.id, { title: 'Hack' })).status).toBe(404)
    const [row] = await testState.db.select().from(jobOffers)
    expect(row!.title).toBe('Dev')
  })
})
