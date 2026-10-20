import { describe, expect, it } from 'vitest'
import {
  ChangePasswordBody,
  CoverLetterBody,
  CreateOfferBody,
  LIMITS,
  LoginBody,
  UpdateApplicationBody,
  UpdateOfferBody,
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
