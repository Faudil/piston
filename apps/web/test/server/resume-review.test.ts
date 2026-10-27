import Anthropic from '@anthropic-ai/sdk'
import { beforeEach, describe, expect, it } from 'vitest'
import { generations, resumes } from '@piston/db'
import type { ResumeReviewOutput } from '@piston/shared'
import resumeReviewRoute from '../../server/api/generate/resume-review.post'
import { callRoute, loginAsNewUser, mockClaude, readSse, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

const output: ResumeReviewOutput = {
  scores: { lisibilite: 7, impact: 5, motsCles: 6, coherence: 8 },
  ats: {
    score: 68,
    checks: [
      {
        criterion: 'Intitulés de sections',
        status: 'warning',
        detail: 'Section « Parcours » au lieu de « Expérience ».',
        fix: 'Renomme-la « Expérience professionnelle ».',
      },
    ],
    summary: 'Lisible par un ATS, mais les titres de sections sont atypiques.',
  },
  strengths: [{ quote: 'Développeuse web', comment: 'Titre clair.' }],
  improvements: [
    { quote: 'Participation à des projets', problem: 'Trop vague.', suggestion: 'Chiffre.' },
  ],
  rewrite: [{ original: 'Participation à des projets', rewritten: 'Pilotage de [X] projets' }],
}

const call = (body: unknown = {}) =>
  callRoute(resumeReviewRoute, { method: 'POST', path: '/api/generate/resume-review', body })

describe('POST /api/generate/resume-review', () => {
  it('streams the review of the current resume and saves it', async () => {
    const { user, resume } = await loginAsNewUser()
    const claude = mockClaude({ text: JSON.stringify(output), parsed: output })

    const events = await readSse(await call())
    const deltas = events.filter((e) => e.type === 'delta').map((e) => e.text)
    expect(deltas.join('')).toBe(JSON.stringify(output))
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      generation: { kind: 'resume_review', output, inputRefs: { resumeId: resume.id } },
    })

    const rows = await testState.db.select().from(generations)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: user.id,
      kind: 'resume_review',
      inputRefs: { resumeId: resume.id },
      model: testState.config.claudeModel,
      inputTokens: 1000,
      outputTokens: 50,
      output,
    })

    const params = claude.calls[0] as {
      model: string
      system: Array<{ text: string; cache_control?: unknown }>
      messages: Array<{ content: Array<{ text: string; cache_control?: unknown }> }>
      output_config: { format?: unknown }
    }
    // The review stays on the main model, with the server-side refusal fallback.
    expect(params.model).toBe(testState.config.claudeModel)
    expect(params).toMatchObject({ fallbacks: 'default' })
    expect(params.system[0]!.text).toContain('senior recruiter')
    expect(params.system[0]!.text).toContain('Camille')
    expect(params.system[0]!.cache_control).toEqual({ type: 'ephemeral' })
    const [resumeBlock, requestBlock] = params.messages[0]!.content
    expect(resumeBlock!.text.startsWith('<cv>\n')).toBe(true)
    expect(resumeBlock!.text).toContain(resume.rawText.trim().split('\n')[0])
    expect(resumeBlock!.cache_control).toEqual({ type: 'ephemeral' })
    expect(requestBlock!.text).toBe('Review this resume.')
    expect(params.output_config.format).toBeDefined()
  })

  it('accepts an older version of the resume by id', async () => {
    const { user, profile } = await loginAsNewUser()
    const [older] = await testState.db
      .insert(resumes)
      .values({
        userId: user.id,
        profileId: profile.id,
        title: 'Ancien',
        rawText: 'Ancien CV unique',
      })
      .returning()
    const claude = mockClaude({ text: JSON.stringify(output), parsed: output })

    const events = await readSse(await call({ resumeId: older!.id }))
    expect(events.at(-1)).toMatchObject({ type: 'done' })
    expect(JSON.stringify(claude.calls[0]!.messages)).toContain('Ancien CV unique')
  })

  it("answers 404 for another user's resume", async () => {
    const { resume: aliceResume } = await loginAsNewUser('alice@example.com')
    await loginAsNewUser('bob@example.com')
    const claude = mockClaude({ text: '{}', parsed: output })

    const res = await call({ resumeId: aliceResume.id })
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ message: 'CV introuvable.' })
    expect(claude.stream).not.toHaveBeenCalled()
  })

  it('answers 400 when the user has no resume', async () => {
    await loginAsNewUser()
    await testState.db.delete(resumes)
    const claude = mockClaude({ text: '{}', parsed: output })

    const res = await call()
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ message: "Ajoute d'abord ton CV sur la page CV." })
    expect(claude.stream).not.toHaveBeenCalled()
  })

  it('sends a French error event when Claude is rate limited', async () => {
    await loginAsNewUser()
    mockClaude({
      text: '',
      error: new Anthropic.RateLimitError(429, {}, 'rate limited', new Headers()),
    })

    const events = await readSse(await call())
    expect(events.at(-1)).toEqual({
      type: 'error',
      message: 'Claude reçoit trop de demandes en ce moment. Réessaie dans une minute.',
    })
    expect(await testState.db.select().from(generations)).toHaveLength(0)
  })

  it('requires a session', async () => {
    expect((await call()).status).toBe(401)
  })
})
