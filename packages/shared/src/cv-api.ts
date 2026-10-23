import * as z from 'zod'
import { CV_LIMITS, CvContent, CvDesign, CvId, CvSectionKey, CvTemplateId } from './cv'
import type { JobOffer } from './models'

/** Request bodies and API shapes of the CV builder routes (/api/cv-documents). */

const documentTitle = z
  .string()
  .trim()
  .min(1, 'Titre requis.')
  .max(
    CV_LIMITS.documentTitle,
    `Le titre ne doit pas dépasser ${CV_LIMITS.documentTitle} caractères.`,
  )

export const CvDocumentsQuery = z.object({
  profileId: z.uuid().optional(),
})
export type CvDocumentsQuery = z.infer<typeof CvDocumentsQuery>

export const CreateCvDocumentBody = z.object({
  /** The profile the CV belongs to. Default: the default profile, created if needed. */
  profileId: z.uuid().optional(),
  title: documentTitle.optional(),
  templateId: CvTemplateId.default('sobre'),
  /** A `cv_draft` generation (import or interview) whose output becomes the content. */
  fromGenerationId: z.uuid().optional(),
})
export type CreateCvDocumentBody = z.infer<typeof CreateCvDocumentBody>

export const cvRevisionSources = ['created', 'manual', 'ai', 'restore'] as const
export const CvRevisionSource = z.enum(cvRevisionSources)
export type CvRevisionSource = z.infer<typeof CvRevisionSource>

/**
 * Autosave and explicit changes. `baseUpdatedAt` is the `updatedAt` the
 * client last saw: the save is refused (409) if the document changed since.
 * `snapshot` records a revision of the saved state (accepting AI edits,
 * changing template...).
 */
export const UpdateCvDocumentBody = z
  .object({
    title: documentTitle.optional(),
    templateId: CvTemplateId.optional(),
    content: CvContent.optional(),
    design: CvDesign.optional(),
    baseUpdatedAt: z.iso.datetime().optional(),
    snapshot: z
      .object({
        label: z.string().trim().min(1).max(120),
        source: z.enum(['manual', 'ai']).default('manual'),
        generationId: z.uuid().optional(),
      })
      .optional(),
  })
  .refine(
    (body) =>
      body.title !== undefined ||
      body.templateId !== undefined ||
      body.content !== undefined ||
      body.design !== undefined,
    'Aucune modification.',
  )
export type UpdateCvDocumentBody = z.infer<typeof UpdateCvDocumentBody>

export const DuplicateCvDocumentBody = z.object({
  title: documentTitle.optional(),
  /** The copy is dedicated to this offer (« Adapter à une offre »). */
  offerId: z.uuid().optional(),
})
export type DuplicateCvDocumentBody = z.infer<typeof DuplicateCvDocumentBody>

export const CvRevisionParams = z.object({ id: z.uuid(), revisionId: z.uuid() })

export const CvPdfQuery = z.object({
  /** Renders the document with another template (gallery thumbnails). */
  templateId: CvTemplateId.optional(),
  /** `1`: served as an attachment (download) rather than inline (preview). */
  download: z.enum(['0', '1']).default('0'),
})
export type CvPdfQuery = z.infer<typeof CvPdfQuery>

export const cvExportFormats = ['txt', 'md', 'json'] as const
export const CvExportQuery = z.object({ format: z.enum(cvExportFormats) })
export type CvExportFormat = (typeof cvExportFormats)[number]

export const SaveCvVersionBody = z.object({
  /** Title of the new resume version. Default: the document's title. */
  title: z.string().trim().min(1).max(120).optional(),
})
export type SaveCvVersionBody = z.infer<typeof SaveCvVersionBody>

/** A CV document as returned by the API. */
export interface CvDocument {
  id: string
  profileId: string
  /** Set when the document is a copy dedicated to an offer. */
  offerId: string | null
  title: string
  templateId: CvTemplateId
  content: CvContent
  design: CvDesign
  createdAt: string
  updatedAt: string
}

/** An entry of the document list (no content). */
export interface CvDocumentSummary {
  id: string
  profileId: string
  title: string
  templateId: CvTemplateId
  /** The name in the header, to recognize the CV. */
  fullName: string
  offer: Pick<JobOffer, 'id' | 'title' | 'company'> | null
  createdAt: string
  updatedAt: string
}

export interface CvRevision {
  id: string
  label: string
  source: CvRevisionSource
  generationId: string | null
  templateId: CvTemplateId
  createdAt: string
}

// --- AI: drafts and edit proposals ------------------------------------------------

/** The answers of « Créer de zéro avec l'IA ». Only the target job and experiences are required. */
export const CvInterviewAnswers = z.object({
  targetJob: z
    .string()
    .trim()
    .min(2, 'Indique le poste que tu vises.')
    .max(200, 'Le poste visé ne doit pas dépasser 200 caractères.'),
  contact: z.string().trim().max(500).default(''),
  experiences: z
    .string()
    .trim()
    .min(20, 'Raconte au moins une expérience (quelques phrases suffisent).')
    .max(4000, 'Tes expériences ne doivent pas dépasser 4000 caractères.'),
  education: z.string().trim().max(2000).default(''),
  skills: z.string().trim().max(2000).default(''),
  extras: z.string().trim().max(2000).default(''),
})
export type CvInterviewAnswers = z.infer<typeof CvInterviewAnswers>

/** The interview's questions, in order, with the hints shown under each field. */
export const cvInterviewQuestions: Array<{
  key: keyof CvInterviewAnswers
  label: string
  help: string
  rows: number
  required: boolean
}> = [
  {
    key: 'targetJob',
    label: 'Quel poste vises-tu ?',
    help: 'Ex. : chargée de communication, développeur web junior…',
    rows: 1,
    required: true,
  },
  {
    key: 'contact',
    label: 'Tes coordonnées',
    help: 'E-mail, téléphone, ville, LinkedIn : ce que tu veux voir sur le CV.',
    rows: 2,
    required: false,
  },
  {
    key: 'experiences',
    label: 'Raconte tes expériences',
    help: 'Pour chacune : le poste, l’entreprise, les dates, ce que tu y as fait et ce que ça a donné. Stages, jobs et bénévolat comptent. Écris comme tu parles, Claude met en forme.',
    rows: 8,
    required: true,
  },
  {
    key: 'education',
    label: 'Tes diplômes et formations',
    help: 'Diplôme, école, année. Les formations courtes et MOOC aussi.',
    rows: 3,
    required: false,
  },
  {
    key: 'skills',
    label: 'Tes compétences et outils',
    help: 'Logiciels, méthodes, savoir-faire.',
    rows: 3,
    required: false,
  },
  {
    key: 'extras',
    label: 'Langues et le reste',
    help: 'Langues et niveaux, projets perso, certifications, centres d’intérêt.',
    rows: 3,
    required: false,
  },
]

export const CvDraftBody = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('import'),
    /** The version to structure. Otherwise the current version of `profileId`, or of the default profile. */
    resumeId: z.uuid().optional(),
    profileId: z.uuid().optional(),
  }),
  z.object({
    mode: z.literal('interview'),
    profileId: z.uuid().optional(),
    answers: CvInterviewAnswers,
  }),
])
export type CvDraftBody = z.infer<typeof CvDraftBody>

/** Inline AI actions on a part of the document (or all of it). */
export const cvAiActions = [
  'stronger',
  'shorten',
  'quantify',
  'fix_french',
  'translate_en',
  'achievements',
] as const
export const CvAiAction = z.enum(cvAiActions)
export type CvAiAction = z.infer<typeof CvAiAction>

export const cvAiActionLabels: Record<CvAiAction, { label: string; icon: string }> = {
  stronger: { label: 'Plus percutant', icon: 'i-lucide-zap' },
  shorten: { label: 'Plus court', icon: 'i-lucide-scissors' },
  quantify: { label: 'Chiffrer', icon: 'i-lucide-percent' },
  achievements: { label: 'En réalisations', icon: 'i-lucide-trophy' },
  fix_french: { label: 'Corriger le français', icon: 'i-lucide-spell-check' },
  translate_en: { label: 'Traduire en anglais', icon: 'i-lucide-languages' },
}

/** What an action applies to: the whole document, a section, an item or a bullet. */
export const CvEditScope = z
  .object({
    section: CvSectionKey.optional(),
    itemId: CvId.optional(),
    bulletId: CvId.optional(),
  })
  .refine((scope) => !scope.itemId || scope.section, 'Précise la section de cet élément.')
  .refine((scope) => !scope.bulletId || scope.itemId, 'Précise l’élément de cette puce.')
export type CvEditScope = z.infer<typeof CvEditScope>

const documentId = z.uuid()

export const CvEditBody = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('instruction'),
    documentId,
    instruction: z
      .string()
      .trim()
      .min(3, 'Dis à Claude ce que tu veux changer.')
      .max(1000, 'Ta demande ne doit pas dépasser 1000 caractères.'),
  }),
  z.object({
    mode: z.literal('action'),
    documentId,
    action: CvAiAction,
    scope: CvEditScope.default({}),
  }),
  z.object({ mode: z.literal('tailor'), documentId, offerId: z.uuid() }),
  z.object({
    mode: z.literal('review'),
    documentId,
    /** Default: the latest review of the document's profile. */
    reviewGenerationId: z.uuid().optional(),
  }),
])
export type CvEditBody = z.infer<typeof CvEditBody>
