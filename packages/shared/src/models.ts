import type {
  ApplicationOutcome,
  ApplicationStatus,
  CoverLetterTemplate,
  GenerationKind,
} from './enums'
import type { CvDraftOutput } from './cv-draft'
import type { CvEditProposal } from './cv-operations'
import type {
  CoverLetterOutput,
  OfferAnalysisOutput,
  ResumeReviewOutput,
  SearchLeadsOutput,
} from './outputs'

/**
 * Shapes returned by the API, as seen by the client (dates are ISO strings
 * once serialized to JSON).
 */

export interface PublicUser {
  id: string
  email: string
  displayName: string
}

export interface Resume {
  id: string
  profileId: string
  title: string
  rawText: string
  sourceFilename: string | null
  /** True when the original PDF was kept and can be downloaded. */
  hasPdf: boolean
  isCurrent: boolean
  createdAt: string
  updatedAt: string
}

export interface JobOffer {
  id: string
  title: string
  company: string
  rawText: string
  url: string | null
  /** The resume profile used for this offer's analysis and letters; null = the default profile. */
  profileId: string | null
  createdAt: string
  updatedAt: string
}

/** A resume per specialty, with its own versions (« Communication », « Marketing digital »...). */
export interface ResumeProfile {
  id: string
  name: string
  /** Used when nothing else is chosen. Exactly one per user who has profiles. */
  isDefault: boolean
  /** The version the AI features use for this profile, if any. */
  current: Pick<Resume, 'id' | 'title' | 'updatedAt'> | null
  versionsCount: number
  createdAt: string
}

/** Maps each generation kind to the JSON stored in `generations.output`. */
export interface GenerationOutputs {
  resume_review: ResumeReviewOutput
  offer_analysis: OfferAnalysisOutput
  cover_letter: CoverLetterOutput
  search_leads: SearchLeadsOutput
  cv_draft: CvDraftOutput
  cv_edit: CvEditProposal
}

/** References to the inputs a generation was produced from. */
export interface GenerationInputRefs {
  resumeId?: string
  /** The resume profile the resume came from (absent on generations made before profiles). */
  profileId?: string
  offerId?: string
  tone?: string
  highlights?: string[]
  /** Set when the generation rewrote a single paragraph of another letter. */
  parentGenerationId?: string
  paragraphIndex?: number
  /** Cover letters: the structure used (CoverLetterTemplate). Absent on older letters = classique. */
  template?: CoverLetterTemplate
  /** Cover letters written from an application (candidature). */
  applicationId?: string
  /** Set when the generation revised another letter following the user's corrections. */
  revisionInstructions?: string
  /** CV builder: the document a proposal was made for (`cv_edit`). */
  cvDocumentId?: string
  /** CV builder: how the draft or the proposal was asked for. */
  cvMode?:
    | 'import'
    | 'interview'
    | 'instruction'
    | 'action'
    | 'tailor'
    | 'review'
    | 'fix'
    | 'summary'
    | 'bullets'
    | 'complete'
    | 'translate'
    | 'one_page'
  /** CV builder: the inline action (`cv_edit` with mode `action`). */
  cvAction?: string
  /** CV builder: the review turned into edits (`cv_edit` with mode `review`). */
  reviewGenerationId?: string
}

export interface Generation<K extends GenerationKind = GenerationKind> {
  id: string
  kind: K
  inputRefs: GenerationInputRefs
  output: GenerationOutputs[K]
  model: string
  inputTokens: number
  outputTokens: number
  createdAt: string
  updatedAt: string
}

export interface StatusChange {
  status: ApplicationStatus
  at: string
}

export interface Application {
  id: string
  jobOfferId: string
  status: ApplicationStatus
  outcome: ApplicationOutcome | null
  notes: string
  statusHistory: StatusChange[]
  createdAt: string
  updatedAt: string
  /** Joined from job_offers for display. */
  offer: Pick<JobOffer, 'id' | 'title' | 'company'>
}

export interface Paginated<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

/** Optional features, enabled when their API key is configured on the server. */
export interface Features {
  /** Job search and offer import from a URL, powered by Tavily. */
  webSearch: boolean
}

export interface JobSearchResult {
  title: string
  url: string
  /** Short excerpt of the page, as returned by the search engine. */
  snippet: string
  /** Hostname of the job board, e.g. "www.welcometothejungle.com". */
  source: string
  publishedDate: string | null
}

export interface JobSearchResponse {
  results: JobSearchResult[]
}

/** A job ad fetched from a URL, cleaned up, ready to prefill the new-offer form. Not saved yet. */
export interface ImportedOffer {
  title: string
  company: string
  rawText: string
  url: string
}

/**
 * One entry of the « Lettres » page: every version written for the same
 * application (or, for letters written from an offer page, the same offer),
 * summarized by its latest version.
 */
export interface LetterSummary {
  /** Id of the latest version. */
  generationId: string
  offer: Pick<JobOffer, 'id' | 'title' | 'company'>
  /** The offer's application when it is tracked: the entry opens /candidatures/:id/lettre. */
  applicationId: string | null
  template: CoverLetterTemplate | null
  versions: number
  /** Start of the first body paragraph, to recognize the letter. */
  excerpt: string
  updatedAt: string
}
