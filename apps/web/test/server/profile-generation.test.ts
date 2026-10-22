import { beforeEach, describe, expect, it } from 'vitest'
import { eq, generations, jobOffers, resumeProfiles, resumes } from '@piston/db'
import type { OfferAnalysisOutput } from '@piston/shared'
import analysisRoute from '../../server/api/generate/offer-analysis.post'
import coverLetterRoute from '../../server/api/generate/cover-letter.post'
import reviewRoute from '../../server/api/generate/resume-review.post'
import searchLeadsRoute from '../../server/api/generate/search-leads.post'
import { callRoute, loginAsNewUser, mockClaude, readSse, resetTestState } from './helpers'
import { testState } from './state'

/*
 * Which resume a generation uses: the version given by id, else the current
 * version of the chosen profile (the offer's, for analyses and letters), else
 * the current version of the default profile.
 */

beforeEach(resetTestState)

/** Adds a « Marketing » profile with a current version whose text is recognizable. */
async function addMarketingProfile(userId: string) {
  const [profile] = await testState.db
    .insert(resumeProfiles)
    .values({ userId, name: 'Marketing' })
    .returning()
  const [resume] = await testState.db
    .insert(resumes)
    .values({
      userId,
      profileId: profile!.id,
      title: 'CV marketing',
      rawText: 'CV MARKETING UNIQUE',
      isCurrent: true,
    })
    .returning()
  return { profile: profile!, resume: resume! }
}

async function insertOffer(userId: string, profileId: string | null = null) {
  const [offer] = await testState.db
    .insert(jobOffers)
    .values({ userId, title: 'Chargée de com', rawText: 'Offre.', profileId })
    .returning()
  return offer!
}

/** The `<cv>` block sent to the mocked Claude. */
function sentResume(claude: ReturnType<typeof mockClaude>) {
  const messages = claude.calls[0]!.messages as Array<{ content: Array<{ text: string }> }>
  return messages[0]!.content[0]!.text
}

const post = (route: Parameters<typeof callRoute>[0], path: string, body: unknown) =>
  callRoute(route, { method: 'POST', path, body })

const analysisOutput: OfferAnalysisOutput = {
  matchScore: 50,
  summary: 'Moyen.',
  atsMatch: { score: 40, foundKeywords: ['communication'], missingKeywords: [] },
  matchingSkills: [],
  missingSkills: [],
  interviewQuestions: [],
  jargon: [],
}

describe('resume used by generations', () => {
  it("analyzes an offer against its profile's current version", async () => {
    const { user } = await loginAsNewUser()
    const marketing = await addMarketingProfile(user.id)
    const offer = await insertOffer(user.id, marketing.profile.id)
    const claude = mockClaude({ text: JSON.stringify(analysisOutput), parsed: analysisOutput })

    const events = await readSse(
      await post(analysisRoute, '/api/generate/offer-analysis', { offerId: offer.id }),
    )
    expect(events.at(-1)).toMatchObject({ type: 'done' })
    expect(sentResume(claude)).toContain('CV MARKETING UNIQUE')
    const [row] = await testState.db.select().from(generations)
    expect(row!.inputRefs).toMatchObject({
      resumeId: marketing.resume.id,
      profileId: marketing.profile.id,
      offerId: offer.id,
    })
  })

  it('uses the default profile for an offer without profile', async () => {
    const { user, profile, resume } = await loginAsNewUser()
    await addMarketingProfile(user.id)
    const offer = await insertOffer(user.id)
    const claude = mockClaude({ text: 'Madame,\n\nParagraphe.' })

    await readSse(
      await post(coverLetterRoute, '/api/generate/cover-letter', {
        offerId: offer.id,
        tone: 'sobre',
      }),
    )
    expect(sentResume(claude)).not.toContain('CV MARKETING UNIQUE')
    const [row] = await testState.db.select().from(generations)
    expect(row!.inputRefs).toMatchObject({ resumeId: resume.id, profileId: profile.id })
  })

  it("writes letters from the offer's profile", async () => {
    const { user } = await loginAsNewUser()
    const marketing = await addMarketingProfile(user.id)
    const offer = await insertOffer(user.id, marketing.profile.id)
    const claude = mockClaude({ text: 'Madame,\n\nParagraphe.' })

    await readSse(
      await post(coverLetterRoute, '/api/generate/cover-letter', {
        offerId: offer.id,
        tone: 'sobre',
      }),
    )
    expect(sentResume(claude)).toContain('CV MARKETING UNIQUE')
  })

  it('reviews the current version of the given profile, the version id winning', async () => {
    const { user, resume } = await loginAsNewUser()
    const marketing = await addMarketingProfile(user.id)
    const output = { summary: 'Ok', strengths: [], improvements: [] }

    let claude = mockClaude({ text: JSON.stringify(output), parsed: output })
    await readSse(
      await post(reviewRoute, '/api/generate/resume-review', { profileId: marketing.profile.id }),
    )
    expect(sentResume(claude)).toContain('CV MARKETING UNIQUE')

    claude = mockClaude({ text: JSON.stringify(output), parsed: output })
    await readSse(
      await post(reviewRoute, '/api/generate/resume-review', {
        profileId: marketing.profile.id,
        resumeId: resume.id,
      }),
    )
    expect(sentResume(claude)).not.toContain('CV MARKETING UNIQUE')
  })

  it('suggests leads from the given profile', async () => {
    const { user } = await loginAsNewUser()
    const marketing = await addMarketingProfile(user.id)
    const output = { jobs: [], keywords: [], companyTypes: [] }
    const claude = mockClaude({ text: JSON.stringify(output), parsed: output })

    await readSse(
      await post(searchLeadsRoute, '/api/generate/search-leads', {
        profileId: marketing.profile.id,
      }),
    )
    expect(sentResume(claude)).toContain('CV MARKETING UNIQUE')
    const [row] = await testState.db.select().from(generations)
    expect(row!.inputRefs).toMatchObject({ profileId: marketing.profile.id })
  })

  it('answers 400 for a profile without version, 404 for a foreign profile', async () => {
    const { profile: alice } = await loginAsNewUser('alice@example.com')
    const { user } = await loginAsNewUser('bob@example.com')
    const [empty] = await testState.db
      .insert(resumeProfiles)
      .values({ userId: user.id, name: 'Vide' })
      .returning()
    const claude = mockClaude({ text: '{}', parsed: {} })

    const res = await post(searchLeadsRoute, '/api/generate/search-leads', {
      profileId: empty!.id,
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      message: "Ce profil de CV n'a pas encore de version.",
    })

    const foreign = await post(reviewRoute, '/api/generate/resume-review', { profileId: alice.id })
    expect(foreign.status).toBe(404)
    expect(claude.stream).not.toHaveBeenCalled()
  })

  it("answers « Ajoute d'abord ton CV » when the user has no resume at all", async () => {
    const { user } = await loginAsNewUser()
    await testState.db.delete(resumeProfiles).where(eq(resumeProfiles.userId, user.id))
    const offer = await insertOffer(user.id)
    const res = await post(analysisRoute, '/api/generate/offer-analysis', { offerId: offer.id })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ message: "Ajoute d'abord ton CV sur la page CV." })
  })

  it('reports the empty default profile when another profile has versions', async () => {
    const { user, profile } = await loginAsNewUser()
    await addMarketingProfile(user.id)
    await testState.db.delete(resumes).where(eq(resumes.profileId, profile.id))
    const res = await post(reviewRoute, '/api/generate/resume-review', {})
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      message: "Ce profil de CV n'a pas encore de version.",
    })
  })
})
