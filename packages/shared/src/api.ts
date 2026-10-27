import * as z from 'zod'
import {
  ApplicationOutcome,
  ApplicationStatus,
  CoverLetterTemplate,
  CoverLetterTone,
  GenerationKind,
} from './enums'
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

/** Sent from the public /demande page. */
export const AccessRequestBody = z.object({
  email: z.email('Adresse e-mail invalide.').toLowerCase(),
  displayName: z.string().trim().min(1, 'Nom requis.').max(80),
  password: z.string().min(10, 'Le mot de passe doit faire au moins 10 caractères.').max(200),
  message: z
    .string()
    .trim()
    .max(500, 'Le message ne doit pas dépasser 500 caractères.')
    .optional()
    .transform((value) => value || undefined),
})
export type AccessRequestBody = z.infer<typeof AccessRequestBody>

/** PATCH /api/admin/users/:id */
export const AdminUserPatchBody = z.object({ isAdmin: z.boolean() })
export type AdminUserPatchBody = z.infer<typeof AdminUserPatchBody>

// --- Resume profiles --------------------------------------------------------

const profileName = z
  .string()
  .trim()
  .min(1, 'Nom du profil requis.')
  .max(60, 'Le nom du profil ne doit pas dépasser 60 caractères.')

export const CreateProfileBody = z.object({
  name: profileName,
})
export type CreateProfileBody = z.infer<typeof CreateProfileBody>

/** Renaming a profile and/or making it the default one (a default cannot be unset, only moved). */
export const UpdateProfileBody = z
  .object({
    name: profileName.optional(),
    isDefault: z.literal(true).optional(),
  })
  .refine((body) => body.name !== undefined || body.isDefault !== undefined, 'Aucune modification.')
export type UpdateProfileBody = z.infer<typeof UpdateProfileBody>

// --- Resumes ----------------------------------------------------------------

export const CreateResumeBody = z.object({
  title: z.string().trim().min(1).max(120),
  rawText: longText,
  /** The profile the version is added to. Default: the default profile, created if needed. */
  profileId: z.uuid().optional(),
})
export type CreateResumeBody = z.infer<typeof CreateResumeBody>

/** Renaming a resume version. */
export const UpdateResumeBody = z.object({
  title: z.string().trim().min(1, 'Titre requis.').max(120),
})
export type UpdateResumeBody = z.infer<typeof UpdateResumeBody>

export const ResumesQuery = z.object({
  profileId: z.uuid().optional(),
})
export type ResumesQuery = z.infer<typeof ResumesQuery>

// --- Offers -----------------------------------------------------------------

export const CreateOfferBody = z.object({
  title: z.string().trim().min(1, 'Intitulé requis.').max(200),
  company: z.string().trim().max(200).default(''),
  rawText: longText,
  url: z.url('URL invalide.').max(2000).optional().or(z.literal('')),
  /** The resume profile the offer is analyzed against. Null or absent: the default profile. */
  profileId: z.uuid().nullable().optional(),
})
export type CreateOfferBody = z.infer<typeof CreateOfferBody>

/** Editing an offer: any subset of the creation fields, at least one. */
export const UpdateOfferBody = z
  .object({
    title: CreateOfferBody.shape.title,
    // Not `CreateOfferBody.shape.company`: its default('') would wipe the company on every edit.
    company: z.string().trim().max(200),
    rawText: CreateOfferBody.shape.rawText,
    url: CreateOfferBody.shape.url,
    profileId: z.uuid().nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Aucune modification.')
export type UpdateOfferBody = z.infer<typeof UpdateOfferBody>

// --- Generations ------------------------------------------------------------

export const ResumeReviewBody = z.object({
  /** A specific version. Otherwise the current version of `profileId`, or of the default profile. */
  resumeId: z.uuid().optional(),
  profileId: z.uuid().optional(),
})
export type ResumeReviewBody = z.infer<typeof ResumeReviewBody>

export const OfferAnalysisBody = z.object({
  offerId: z.uuid(),
})
export type OfferAnalysisBody = z.infer<typeof OfferAnalysisBody>

export const CoverLetterBody = z
  .object({
    offerId: z.uuid(),
    tone: CoverLetterTone,
    template: CoverLetterTemplate.default('classique'),
    highlights: z.array(z.string().trim().min(1).max(300)).max(3).default([]),
    /**
     * The application the letter is written for. Its notes (recruiter's name,
     * referral...) are given to Claude as context. Its offer must be `offerId`.
     */
    applicationId: z.uuid().optional(),
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
    /**
     * When set, the whole letter `generationId` is revised following the
     * user's corrections (e.g. « plus court »). `paragraphs` is the current text.
     */
    revision: z
      .object({
        generationId: z.uuid(),
        paragraphs: z.array(z.string().max(5000)).min(1).max(20),
        instructions: z
          .string()
          .trim()
          .min(1, 'Indique ce que tu veux corriger.')
          .max(1000, 'Les corrections ne doivent pas dépasser 1000 caractères.'),
      })
      .optional(),
  })
  .refine((body) => !(body.regenerateParagraph && body.revision), {
    message: 'Choisis soit un paragraphe à régénérer, soit des corrections, pas les deux.',
    path: ['revision'],
  })
export type CoverLetterBody = z.infer<typeof CoverLetterBody>

export const SearchLeadsBody = z
  .object({
    /** The profile whose current resume is used. Default: the default profile. */
    profileId: z.uuid().optional(),
  })
  .strict()
export type SearchLeadsBody = z.infer<typeof SearchLeadsBody>

export const GenerationsQuery = z.object({
  kind: GenerationKind.optional(),
  /** Only generations made from this resume profile (`inputRefs.profileId`). */
  profileId: z.uuid().optional(),
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

// --- Web search (Tavily) ----------------------------------------------------

/** Searches job boards for live offers matching a query. */
export const JobSearchBody = z.object({
  query: z.string().trim().min(2, 'Recherche trop courte.').max(200),
  location: z.string().trim().max(100).optional(),
})
export type JobSearchBody = z.infer<typeof JobSearchBody>

/** Fetches a job ad from its URL to prefill the new-offer form. */
export const ImportOfferBody = z.object({
  url: z.url('URL invalide.').max(2000),
})
export type ImportOfferBody = z.infer<typeof ImportOfferBody>

// --- Account ----------------------------------------------------------------

export const UpdateAccountBody = z.object({
  displayName: z.string().trim().min(1, 'Nom requis.').max(80),
})
export type UpdateAccountBody = z.infer<typeof UpdateAccountBody>

export const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis.').max(200),
  newPassword: z.string().min(10, 'Le mot de passe doit faire au moins 10 caractères.').max(200),
})
export type ChangePasswordBody = z.infer<typeof ChangePasswordBody>

/** Deleting the account requires typing the account's e-mail address. */
export const DeleteAccountBody = z.object({
  confirmEmail: z.string().trim().toLowerCase().min(1, 'Saisis ton adresse e-mail.'),
})
export type DeleteAccountBody = z.infer<typeof DeleteAccountBody>
