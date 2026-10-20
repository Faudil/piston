import { describe, expect, it } from 'vitest'
import { CoverLetterBody, CreateOfferBody, LIMITS, LoginBody, UpdateApplicationBody } from '../src'

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

  it('allows at most 3 cover letter highlights', () => {
    const body = { offerId: crypto.randomUUID(), tone: 'sobre', highlights: ['a', 'b', 'c', 'd'] }
    expect(CoverLetterBody.safeParse(body).success).toBe(false)
    expect(CoverLetterBody.parse({ ...body, highlights: undefined }).highlights).toEqual([])
  })

  it('rejects an empty application update', () => {
    expect(UpdateApplicationBody.safeParse({}).success).toBe(false)
    expect(UpdateApplicationBody.safeParse({ status: 'sent' }).success).toBe(true)
    expect(UpdateApplicationBody.safeParse({ status: 'lost' }).success).toBe(false)
  })
})
