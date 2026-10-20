import { beforeEach, describe, expect, it } from 'vitest'
import { generations } from '@piston/db'
import type { JobOffer } from '@piston/shared'
import listRoute from '../../server/api/offers.get'
import createRoute from '../../server/api/offers.post'
import getRoute from '../../server/api/offers/[id].get'
import deleteRoute from '../../server/api/offers/[id].delete'
import offerGenerationsRoute from '../../server/api/offers/[id]/generations.get'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

const offerBody = {
  title: 'Développeuse front',
  company: 'Acme',
  rawText: 'Nous cherchons une développeuse Vue.js.',
  url: '',
}

async function createOffer(body: Record<string, unknown> = offerBody) {
  const res = await callRoute(createRoute, { method: 'POST', path: '/api/offers', body })
  return { res, offer: (await res.json()) as JobOffer }
}

const byId = (handler: Parameters<typeof callRoute>[0], id: string, method = 'GET') =>
  callRoute(handler, { method, path: `/api/offers/${id}`, route: '/api/offers/:id' })

describe('offers', () => {
  it('creates, lists (newest first), reads and deletes offers', async () => {
    await loginAsNewUser()
    const { res, offer: first } = await createOffer()
    expect(res.status).toBe(201)
    expect(first).toMatchObject({ title: 'Développeuse front', company: 'Acme', url: null })

    const { offer: second } = await createOffer({
      ...offerBody,
      title: 'Lead dev',
      url: 'https://example.com/job',
    })
    expect(second.url).toBe('https://example.com/job')

    const list = (await (await callRoute(listRoute, { path: '/api/offers' })).json()) as JobOffer[]
    expect(list.map((o) => o.id)).toEqual([second.id, first.id])

    expect(await (await byId(getRoute, first.id)).json()).toMatchObject({ id: first.id })

    expect((await byId(deleteRoute, first.id, 'DELETE')).status).toBe(200)
    expect((await byId(getRoute, first.id)).status).toBe(404)
  })

  it('validates the body', async () => {
    await loginAsNewUser()
    const { res } = await createOffer({ ...offerBody, rawText: 'x'.repeat(20_001) })
    expect(res.status).toBe(400)
    const noTitle = await createOffer({ ...offerBody, title: '' })
    expect(noTitle.res.status).toBe(400)
  })

  it("never exposes another user's offers", async () => {
    await loginAsNewUser('alice@example.com')
    const { offer } = await createOffer()

    await loginAsNewUser('bob@example.com')
    const list = await (await callRoute(listRoute, { path: '/api/offers' })).json()
    expect(list).toEqual([])
    expect((await byId(getRoute, offer.id)).status).toBe(404)
    expect((await byId(deleteRoute, offer.id, 'DELETE')).status).toBe(404)
    const gens = await callRoute(offerGenerationsRoute, {
      path: `/api/offers/${offer.id}/generations`,
      route: '/api/offers/:id/generations',
    })
    expect(gens.status).toBe(404)
  })

  it('returns the latest analysis and letter of an offer', async () => {
    const { user } = await loginAsNewUser()
    const { offer } = await createOffer()
    const { offer: other } = await createOffer()
    const row = (kind: 'offer_analysis' | 'cover_letter', offerId: string, at: number) => ({
      userId: user.id,
      kind,
      inputRefs: { offerId },
      output: { paragraphs: [`${kind}-${at}`] },
      model: 'test',
      createdAt: new Date(at),
    })
    await testState.db
      .insert(generations)
      .values([
        row('cover_letter', offer.id, 1000),
        row('cover_letter', offer.id, 2000),
        row('cover_letter', other.id, 3000),
      ])

    const res = await callRoute(offerGenerationsRoute, {
      path: `/api/offers/${offer.id}/generations`,
      route: '/api/offers/:id/generations',
    })
    const body = await res.json()
    expect(body.analysis).toBeNull()
    expect(body.coverLetter.output).toEqual({ paragraphs: ['cover_letter-2000'] })
  })
})
