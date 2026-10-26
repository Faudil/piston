/**
 * Step-by-step editing on phones: the CV editor shows one section per screen
 * (the header first, then the listed sections in their order). Steps are
 * identified by section ref, not by position, so moving a section or hiding
 * one never changes which screen the user is on.
 */
export const CV_HEADER_STEP = 'header'

export interface CvStep {
  /** `header`, or a `cvSectionRef`. */
  ref: string
  label: string
  /** One line about what the section holds, shown in the section list. */
  summary: string
}

/** Position of `current` in `steps`; the first step when it no longer exists. */
export function cvStepIndex(steps: readonly CvStep[], current: string): number {
  const index = steps.findIndex((step) => step.ref === current)
  return index === -1 ? 0 : index
}

/** The step `delta` places from `current`, stopping at both ends. */
export function cvStepAfter(steps: readonly CvStep[], current: string, delta: number): string {
  if (!steps.length) return CV_HEADER_STEP
  const target = Math.min(steps.length - 1, Math.max(0, cvStepIndex(steps, current) + delta))
  return steps[target]!.ref
}

/** « Étape 2 sur 6 » and the filled share of the progress bar (0-100). */
export function cvStepProgress(steps: readonly CvStep[], current: string) {
  const position = cvStepIndex(steps, current) + 1
  const total = Math.max(steps.length, 1)
  return { position, total, percent: Math.round((position / total) * 100) }
}
