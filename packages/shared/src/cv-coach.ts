import type { CvContent } from './cv'
import type { AtsStatus, ResumeReviewOutput } from './outputs'

/**
 * The coach panel's data: how complete the document is (computed here, no
 * AI) and the latest resume review of the document's profile (stored by
 * `resume_review` generations; see `GET /api/cv-documents/:id/coach`).
 */

export interface CvCompleteness {
  /** 0 to 100. */
  score: number
  /** What is missing, in French, most important first. */
  missing: string[]
}

const PLACEHOLDER = /\[[^\]]{1,40}\]/

/** Weighted share of the essentials a recruiter looks for. Deterministic. */
export function cvCompleteness(content: CvContent): CvCompleteness {
  const { header } = content
  const visible = (key: 'languages' | 'skills' | 'education') =>
    content.sections.some((section) => section.key === key && section.visible)
  const strongExperience = [...content.experiences, ...content.projects].some(
    (item) => item.bullets.filter((bullet) => bullet.text.trim()).length >= 2,
  )
  const hasPlaceholder = JSON.stringify(content).match(PLACEHOLDER) !== null
  const checks: Array<[boolean, number, string]> = [
    [header.fullName.trim() !== '', 10, 'ton nom'],
    [header.title.trim() !== '', 10, 'un titre sous ton nom'],
    [header.email.trim() !== '', 10, 'ton e-mail'],
    [header.phone.trim() !== '', 5, 'ton téléphone'],
    [header.city.trim() !== '', 5, 'ta ville'],
    [content.summary.trim() !== '', 10, 'une accroche'],
    [strongExperience, 20, 'au moins une expérience ou un projet avec deux puces ou plus'],
    [
      visible('education') &&
        content.education.some((item) => item.degree.trim() || item.school.trim()),
      10,
      'ta formation',
    ],
    [content.skills.length > 0 && visible('skills'), 10, 'tes compétences'],
    [content.languages.length > 0 && visible('languages'), 5, 'tes langues'],
    [!hasPlaceholder, 5, 'les passages entre crochets à remplir'],
  ]
  return {
    score: checks.reduce((sum, [ok, points]) => sum + (ok ? points : 0), 0),
    missing: checks
      .filter(([ok]) => !ok)
      .sort((a, b) => b[1] - a[1])
      .map(([, , label]) => label),
  }
}

/** The latest review of the document's profile, trimmed for the coach panel. */
export interface CvCoachReview {
  generationId: string
  createdAt: string
  /** The resume version the review was about. */
  resumeId: string
  resumeTitle: string
  /** False when the profile's current version is a newer one than the reviewed one. */
  isCurrentVersion: boolean
  /** True when the document was edited after the reviewed version was saved: the review may be out of date. */
  documentChangedSince: boolean
  /** Average of the four category scores, out of 10; null when the review has none. */
  score: number | null
  scores: ResumeReviewOutput['scores']
  atsScore: number | null
  atsSummary: string
  /** ATS checks that are not « ok ». */
  atsIssues: Array<{
    criterion: string
    status: Exclude<AtsStatus, 'ok'>
    detail: string
    fix: string
  }>
  improvements: ResumeReviewOutput['improvements']
}

export interface CvCoachResponse {
  review: CvCoachReview | null
}
