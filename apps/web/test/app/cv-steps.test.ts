import { describe, expect, it } from 'vitest'
import { cvStepAfter, cvStepIndex, cvStepProgress, type CvStep } from '../../app/utils/cv-steps'

const steps: CvStep[] = ['header', 'summary', 'experiences', 'education'].map((ref) => ({
  ref,
  label: ref,
  summary: '',
}))

describe('cvStepIndex', () => {
  it('finds a step by ref', () => {
    expect(cvStepIndex(steps, 'experiences')).toBe(2)
  })
  it('falls back to the first step when the ref disappeared (section deleted)', () => {
    expect(cvStepIndex(steps, 'custom:gone')).toBe(0)
  })
})

describe('cvStepAfter', () => {
  it('moves forward and backward', () => {
    expect(cvStepAfter(steps, 'summary', 1)).toBe('experiences')
    expect(cvStepAfter(steps, 'summary', -1)).toBe('header')
  })
  it('stops at both ends', () => {
    expect(cvStepAfter(steps, 'header', -1)).toBe('header')
    expect(cvStepAfter(steps, 'education', 1)).toBe('education')
  })
  it('restarts from the first step when the current one is gone', () => {
    expect(cvStepAfter(steps, 'custom:gone', 1)).toBe('summary')
  })
  it('handles an empty list', () => {
    expect(cvStepAfter([], 'x', 1)).toBe('header')
  })
})

describe('cvStepProgress', () => {
  it('reports the position and the filled share', () => {
    expect(cvStepProgress(steps, 'header')).toEqual({ position: 1, total: 4, percent: 25 })
    expect(cvStepProgress(steps, 'education')).toEqual({ position: 4, total: 4, percent: 100 })
  })
})
