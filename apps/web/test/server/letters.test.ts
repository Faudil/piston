import { beforeEach, describe, expect, it } from 'vitest'
import { applications, generations, jobOffers } from '@piston/db'
import type { LetterSummary } from '@piston/shared'
import listLetters from '../../server/api/letters.get'
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
