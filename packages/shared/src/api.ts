import * as z from 'zod'
import { ApplicationOutcome, ApplicationStatus, CoverLetterTone, GenerationKind } from './enums'
import { LIMITS } from './limits'

/** Request body schemas, validated on the server by every API route. */

const longText = z
  .string()
  .trim()
  .min(1, 'Ce champ est obligatoire.')
  .max(LIMITS.maxTextLength, `Le texte ne doit pas dépasser ${LIMITS.maxTextLength} caractères.`)

// --- Auth -------------------------------------------------------------------

export const LoginBody = z.object({
  email: z.email('Adresse e-mail invalide.').toLowerCase(),
  password: z.string().min(1, 'Mot de passe requis.').max(200),
})
export type LoginBody = z.infer<typeof LoginBody>

export const RegisterBody = z.object({
  token: z.string().min(1),
  email: z.email('Adresse e-mail invalide.').toLowerCase(),
  displayName: z.string().trim().min(1, 'Nom requis.').max(80),
  password: z.string().min(10, 'Le mot de passe doit faire au moins 10 caractères.').max(200),
})
export type RegisterBody = z.infer<typeof RegisterBody>

// --- Resumes ----------------------------------------------------------------

export const CreateResumeBody = z.object({
  title: z.string().trim().min(1).max(120),
  rawText: longText,
})
export type CreateResumeBody = z.infer<typeof CreateResumeBody>

// --- Offers -----------------------------------------------------------------

export const CreateOfferBody = z.object({
  title: z.string().trim().min(1, 'Intitulé requis.').max(200),
  company: z.string().trim().max(200).default(''),
  rawText: longText,
  url: z.url('URL invalide.').max(2000).optional().or(z.literal('')),
})
export type CreateOfferBody = z.infer<typeof CreateOfferBody>

// --- Generations ------------------------------------------------------------

export const ResumeReviewBody = z.object({
  resumeId: z.uuid().optional(),
})
export type ResumeReviewBody = z.infer<typeof ResumeReviewBody>

export const OfferAnalysisBody = z.object({
  offerId: z.uuid(),
})
export type OfferAnalysisBody = z.infer<typeof OfferAnalysisBody>

export const CoverLetterBody = z.object({
  offerId: z.uuid(),
  tone: CoverLetterTone,
  highlights: z.array(z.string().trim().min(1).max(300)).max(3).default([]),
  /**
   * When set, only this paragraph of an existing letter is rewritten.
   * `generationId` points at the letter being edited, `paragraphs` carries the
   * current (possibly user-edited) text.
   */
  regenerateParagraph: z
    .object({
      generationId: z.uuid(),
      index: z.number().int().min(0),
      paragraphs: z.array(z.string().max(5000)).min(1).max(20),
    })
    .optional(),
})
export type CoverLetterBody = z.infer<typeof CoverLetterBody>

export const SearchLeadsBody = z.object({}).strict()

export const GenerationsQuery = z.object({
  kind: GenerationKind.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})
export type GenerationsQuery = z.infer<typeof GenerationsQuery>

/** Saving a user-edited cover letter. */
export const UpdateGenerationBody = z.object({
  paragraphs: z.array(z.string().max(5000)).min(1).max(20),
})
export type UpdateGenerationBody = z.infer<typeof UpdateGenerationBody>

// --- Applications -----------------------------------------------------------

export const CreateApplicationBody = z.object({
  jobOfferId: z.uuid(),
  notes: z.string().max(5000).default(''),
})
export type CreateApplicationBody = z.infer<typeof CreateApplicationBody>

export const UpdateApplicationBody = z
  .object({
    status: ApplicationStatus.optional(),
    outcome: ApplicationOutcome.nullable().optional(),
    notes: z.string().max(5000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Aucune modification.')
export type UpdateApplicationBody = z.infer<typeof UpdateApplicationBody>

export const IdParam = z.object({ id: z.uuid() })
