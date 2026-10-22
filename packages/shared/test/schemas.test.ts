import { describe, expect, it } from 'vitest'
import {
  ChangePasswordBody,
  CoverLetterBody,
  CreateOfferBody,
  CreateProfileBody,
  LIMITS,
  LoginBody,
  OfferAnalysisOutput,
  ResumeReviewOutput,
  UpdateApplicationBody,
  UpdateOfferBody,
  UpdateProfileBody,
} from '../src'

describe('request schemas', () => {
  it('normalizes e-mails to lower case', () => {
    expect(LoginBody.parse({ email: 'Camille@Example.COM', password: 'x' }).email).toBe(
      'camille@example.com',
    )
  })

  it('bounds the length of pasted texts', () => {
    const base = { title: 'Dev', rawText: 'a'.repeat(LIMITS.maxTextLength) }
    expect(CreateOfferBody.safeParse(base).success).toBe(true)
    expect(CreateOfferBody.safeParse({ ...base, rawText: base.rawText + 'a' }).success).toBe(false)
  })

  it('accepts an empty offer URL', () => {
    expect(CreateOfferBody.parse({ title: 'Dev', rawText: 'texte', url: '' }).url).toBe('')
  })

  it('only keeps the given fields when editing an offer', () => {
    expect(UpdateOfferBody.parse({ title: 'Dev' })).toEqual({ title: 'Dev' })
    expect(UpdateOfferBody.safeParse({}).success).toBe(false)
  })

  it('lets an offer edit clear its resume profile', () => {
    expect(UpdateOfferBody.parse({ profileId: null })).toEqual({ profileId: null })
    expect(UpdateOfferBody.safeParse({ profileId: 'abc' }).success).toBe(false)
  })

  it('bounds resume profile names and refuses an empty profile update', () => {
    expect(CreateProfileBody.parse({ name: '  Marketing  ' }).name).toBe('Marketing')
    expect(CreateProfileBody.safeParse({ name: ' ' }).success).toBe(false)
    expect(CreateProfileBody.safeParse({ name: 'a'.repeat(61) }).success).toBe(false)
    expect(UpdateProfileBody.safeParse({}).success).toBe(false)
    expect(UpdateProfileBody.safeParse({ isDefault: false }).success).toBe(false)
    expect(UpdateProfileBody.safeParse({ isDefault: true }).success).toBe(true)
  })

  it('requires a new password of at least 10 characters', () => {
    expect(
      ChangePasswordBody.safeParse({ currentPassword: 'x', newPassword: 'short' }).success,
    ).toBe(false)
    expect(
      ChangePasswordBody.safeParse({ currentPassword: 'x', newPassword: 'long-enough-1' }).success,
    ).toBe(true)
  })

  it('allows at most 3 cover letter highlights', () => {
    const body = { offerId: crypto.randomUUID(), tone: 'sobre', highlights: ['a', 'b', 'c', 'd'] }
    expect(CoverLetterBody.safeParse(body).success).toBe(false)
    expect(CoverLetterBody.parse({ ...body, highlights: undefined }).highlights).toEqual([])
  })

  it('defaults the cover letter template and forbids revision + paragraph together', () => {
    const base = { offerId: crypto.randomUUID(), tone: 'sobre' }
    expect(CoverLetterBody.parse(base).template).toBe('classique')
    expect(CoverLetterBody.safeParse({ ...base, template: 'poème' }).success).toBe(false)
    const generationId = crypto.randomUUID()
    const revision = { generationId, paragraphs: ['A'], instructions: 'Plus court' }
    expect(CoverLetterBody.safeParse({ ...base, revision }).success).toBe(true)
    expect(
      CoverLetterBody.safeParse({ ...base, revision: { ...revision, instructions: '  ' } }).success,
    ).toBe(false)
    expect(
      CoverLetterBody.safeParse({
        ...base,
        revision,
        regenerateParagraph: { generationId, index: 0, paragraphs: ['A'] },
      }).success,
    ).toBe(false)
  })

  it('rejects an empty application update', () => {
    expect(UpdateApplicationBody.safeParse({}).success).toBe(false)
    expect(UpdateApplicationBody.safeParse({ status: 'sent' }).success).toBe(true)
    expect(UpdateApplicationBody.safeParse({ status: 'lost' }).success).toBe(false)
  })
})

describe('ATS outputs', () => {
  const review = {
    scores: { lisibilite: 7, impact: 5, motsCles: 6, coherence: 8 },
    ats: {
      score: 72,
      checks: [
        { criterion: 'Coordonnées', status: 'ok', detail: 'Présentes dans le corps.', fix: '' },
        {
          criterion: 'Colonnes',
          status: 'problem',
          detail: 'Lignes mélangées.',
          fix: 'Une colonne.',
        },
      ],
      summary: 'Correct.',
    },
    strengths: [],
    improvements: [],
    rewrite: [],
  }

  it('parses a resume review with an ATS block', () => {
    expect(ResumeReviewOutput.parse(review).ats.checks).toHaveLength(2)
  })

  it('rejects an unknown ATS status', () => {
    const bad = {
      ...review,
      ats: { ...review.ats, checks: [{ ...review.ats.checks[0], status: 'maybe' }] },
    }
    expect(ResumeReviewOutput.safeParse(bad).success).toBe(false)
  })

  it('parses an offer analysis with an ATS keyword match', () => {
    const analysis = OfferAnalysisOutput.parse({
      matchScore: 70,
      summary: 'Bon.',
      atsMatch: {
        score: 55,
        foundKeywords: ['Vue.js'],
        missingKeywords: [{ keyword: 'Go', suggestion: 'À acquérir.' }],
      },
      matchingSkills: [],
      missingSkills: [],
      interviewQuestions: [],
      jargon: [],
    })
    expect(analysis.atsMatch.missingKeywords[0]?.keyword).toBe('Go')
  })
})
