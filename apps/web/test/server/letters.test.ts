import { beforeEach, describe, expect, it } from 'vitest'
import { applications, generations, jobOffers } from '@piston/db'
import type { LetterSummary } from '@piston/shared'
import listLetters from '../../server/api/letters.get'
import offerLettersRoute from '../../server/api/offers/[id]/letters.get'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

async function insertOffer(userId: string, title: string) {
  const [offer] = await testState.db
    .insert(jobOffers)
    .values({ userId, title, company: 'Acme', rawText: 'Offre.' })
    .returning()
  return offer!
}

async function insertLetter(
  userId: string,
  inputRefs: Record<string, string>,
  paragraphs: string[],
  createdAt: Date,
) {
  await testState.db.insert(generations).values({
    userId,
    kind: 'cover_letter',
    inputRefs,
    output: { paragraphs },
    model: 'test',
    createdAt,
  })
}

const body = 'Un vrai paragraphe de lettre, assez long pour servir d’extrait dans la liste.'

describe('GET /api/letters', () => {
  it('groups versions per application and per offer, newest first', async () => {
    const { user } = await loginAsNewUser()
    const offerA = await insertOffer(user.id, 'Poste A')
    const offerB = await insertOffer(user.id, 'Poste B')
    const [application] = await testState.db
      .insert(applications)
      .values({ userId: user.id, jobOfferId: offerA.id })
      .returning()

    const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12))
    const fromApplication = { offerId: offerA.id, applicationId: application!.id }
    await insertLetter(user.id, fromApplication, ['Madame, Monsieur,', 'v1 ' + body], day(1))
    await insertLetter(
      user.id,
      { ...fromApplication, template: 'percutante' },
      ['Madame, Monsieur,', 'v2 ' + body],
      day(3),
    )
    await insertLetter(user.id, { offerId: offerB.id }, ['Madame, Monsieur,', body], day(2))

    const res = await callRoute(listLetters, { path: '/api/letters' })
    const letters = (await res.json()) as LetterSummary[]

    expect(letters).toHaveLength(2)
    expect(letters[0]).toMatchObject({
      offer: { id: offerA.id, title: 'Poste A', company: 'Acme' },
      applicationId: application!.id,
      template: 'percutante',
      versions: 2,
    })
    expect(letters[0]!.excerpt.startsWith('v2 ')).toBe(true)
    expect(letters[1]).toMatchObject({ offer: { id: offerB.id }, applicationId: null, versions: 1 })
  })

  it('merges the letters written from the offer page into its application entry', async () => {
    const { user } = await loginAsNewUser()
    const offer = await insertOffer(user.id, 'Poste A')
    const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12))
    // Written from the offer page before the offer was tracked...
    await insertLetter(user.id, { offerId: offer.id }, ['Madame, Monsieur,', body], day(1))
    const [application] = await testState.db
      .insert(applications)
      .values({ userId: user.id, jobOfferId: offer.id })
      .returning()
    // ...then from the application's letter page.
    await insertLetter(
      user.id,
      { offerId: offer.id, applicationId: application!.id },
      ['Madame, Monsieur,', 'v2 ' + body],
      day(2),
    )

    const letters = (await (
      await callRoute(listLetters, { path: '/api/letters' })
    ).json()) as LetterSummary[]
    expect(letters).toHaveLength(1)
    expect(letters[0]).toMatchObject({ applicationId: application!.id, versions: 2 })
  })

  it("skips letters whose offer was deleted and never shows another user's letters", async () => {
    const { user } = await loginAsNewUser('a@example.com')
    const kept = await insertOffer(user.id, 'Gardée')
    await insertLetter(user.id, { offerId: kept.id }, [body], new Date())
    // A letter pointing at an offer that no longer exists.
    await insertLetter(user.id, { offerId: crypto.randomUUID() }, [body], new Date())

    const { user: other } = await loginAsNewUser('b@example.com')
    const otherOffer = await insertOffer(other.id, 'Autre')
    await insertLetter(other.id, { offerId: otherOffer.id }, [body], new Date())

    testState.user = { id: user.id, email: user.email, displayName: user.displayName }
    const letters = (await (
      await callRoute(listLetters, { path: '/api/letters' })
    ).json()) as LetterSummary[]
    expect(letters.map((l) => l.offer.title)).toEqual(['Gardée'])
  })

  it('requires a session', async () => {
    expect((await callRoute(listLetters, { path: '/api/letters' })).status).toBe(401)
  })
})

describe('GET /api/offers/:id/letters', () => {
  const listOfferLetters = (offerId: string) =>
    callRoute(offerLettersRoute, {
      path: `/api/offers/${offerId}/letters`,
      route: '/api/offers/:id/letters',
    })

  it('lists every letter of the offer, newest first, for its owner only', async () => {
    const { user: alice } = await loginAsNewUser('alice@example.com')
    const offer = await insertOffer(alice.id, 'Poste A')
    const other = await insertOffer(alice.id, 'Poste B')
    const [application] = await testState.db
      .insert(applications)
      .values({ userId: alice.id, jobOfferId: offer.id })
      .returning()
    const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12))
    await insertLetter(alice.id, { offerId: offer.id }, ['v1'], day(1))
    await insertLetter(
      alice.id,
      { offerId: offer.id, applicationId: application!.id },
      ['v2'],
      day(2),
    )
    await insertLetter(alice.id, { offerId: other.id }, ['autre'], day(3))

    const res = await listOfferLetters(offer.id)
    expect(res.status).toBe(200)
    const letters = (await res.json()) as { output: { paragraphs: string[] } }[]
    expect(letters.map((l) => l.output.paragraphs[0])).toEqual(['v2', 'v1'])
    expect(letters[0]).not.toHaveProperty('userId')

    const { user: bob } = await loginAsNewUser('bob@example.com')
    await insertLetter(bob.id, { offerId: offer.id }, ['intrus'], day(4))
    expect((await listOfferLetters(offer.id)).status).toBe(404)
  })
})
