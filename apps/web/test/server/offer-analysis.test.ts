import { beforeEach, describe, expect, it } from 'vitest'
import { generations, jobOffers } from '@piston/db'
import type { OfferAnalysisOutput } from '@piston/shared'
import analysisRoute from '../../server/api/generate/offer-analysis.post'
import { callRoute, loginAsNewUser, mockClaude, readSse, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

const output: OfferAnalysisOutput = {
  matchScore: 72,
  summary: 'Bon profil.',
  atsMatch: {
    score: 60,
    foundKeywords: ['Vue.js'],
    missingKeywords: [{ keyword: 'Go', suggestion: 'À acquérir : suis un tutoriel.' }],
  },
  matchingSkills: [{ skill: 'Vue.js', evidence: 'Deux ans chez Acme.' }],
  missingSkills: [{ skill: 'Go', advice: 'Suis un tutoriel.' }],
  interviewQuestions: [{ question: 'Pourquoi nous ?', hint: 'Ton projet X.' }],
  jargon: [{ term: 'Environnement stimulant', meaning: 'Beaucoup de travail.' }],
}

async function insertOffer(userId: string) {
  const [offer] = await testState.db
    .insert(jobOffers)
    .values({ userId, title: 'Dev front', company: 'Globex', rawText: 'Offre Vue.js à Lyon.' })
    .returning()
  return offer!
}

const call = (offerId: string) =>
  callRoute(analysisRoute, {
    method: 'POST',
    path: '/api/generate/offer-analysis',
    body: { offerId },
  })

describe('POST /api/generate/offer-analysis', () => {
  it('streams the analysis and saves it', async () => {
    const { user, resume } = await loginAsNewUser()
    const offer = await insertOffer(user.id)
    const claude = mockClaude({ text: JSON.stringify(output), parsed: output })

    const events = await readSse(await call(offer.id))
    expect(events.some((e) => e.type === 'delta')).toBe(true)
    expect(events.find((e) => e.type === 'done')).toMatchObject({
      generation: { kind: 'offer_analysis', output },
    })

    const rows = await testState.db.select().from(generations)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: user.id,
      kind: 'offer_analysis',
      inputRefs: { resumeId: resume.id, offerId: offer.id },
    })

    const params = claude.calls[0]!
    const messages = JSON.stringify(params.messages)
    expect(messages).toContain('<cv>')
    expect(messages).toContain('<offre>')
    expect(messages).toContain('Dev front — Globex')
    expect(messages).toContain('Offre Vue.js à Lyon.')
    expect(messages).toContain('cache_control')
    expect(JSON.stringify(params.system)).toContain('Camille')
    expect(params.output_config).toHaveProperty('format')
  })

  it("answers 404 for another user's offer without calling Claude", async () => {
    const { user: alice } = await loginAsNewUser('alice@example.com')
    const offer = await insertOffer(alice.id)
    await loginAsNewUser('bob@example.com')
    const claude = mockClaude({ text: '{}', parsed: output })

    const res = await call(offer.id)
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ message: 'Offre introuvable.' })
    expect(claude.stream).not.toHaveBeenCalled()
  })

  it('rejects an invalid offer id', async () => {
    await loginAsNewUser()
    expect((await call('not-a-uuid')).status).toBe(400)
  })
})
