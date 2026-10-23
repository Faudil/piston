import * as z from 'zod'

/**
 * The Claude-powered features. Also the value of `generations.kind`.
 * `cv_draft` and `cv_edit` are the CV builder's first drafts and edit proposals.
 */
export const generationKinds = [
  'resume_review',
  'offer_analysis',
  'cover_letter',
  'search_leads',
  'cv_draft',
  'cv_edit',
] as const
export const GenerationKind = z.enum(generationKinds)
export type GenerationKind = z.infer<typeof GenerationKind>

/** Columns of the application kanban, in display order. */
export const applicationStatuses = ['to_send', 'sent', 'follow_up', 'interview', 'closed'] as const
export const ApplicationStatus = z.enum(applicationStatuses)
export type ApplicationStatus = z.infer<typeof ApplicationStatus>

/** How a closed application ended. Only meaningful when status is `closed`. */
export const ApplicationOutcome = z.enum(['accepted', 'rejected'])
export type ApplicationOutcome = z.infer<typeof ApplicationOutcome>

export const CoverLetterTone = z.enum(['sobre', 'enthousiaste', 'startup'])
export type CoverLetterTone = z.infer<typeof CoverLetterTone>

/** French labels used by the UI. Kept here so every page uses the same wording. */
export const generationKindLabels: Record<GenerationKind, string> = {
  resume_review: 'Critique de CV',
  offer_analysis: "Analyse d'offre",
  cover_letter: 'Lettre de motivation',
  search_leads: 'Pistes de recherche',
  cv_draft: 'Brouillon de CV',
  cv_edit: 'Modifications de CV',
}

export const applicationStatusLabels: Record<ApplicationStatus, string> = {
  to_send: 'À envoyer',
  sent: 'Envoyée',
  follow_up: 'Relance',
  interview: 'Entretien',
  closed: 'Terminée',
}

export const coverLetterToneLabels: Record<CoverLetterTone, string> = {
  sobre: 'Sobre',
  enthousiaste: 'Enthousiaste',
  startup: 'Startup',
}

/**
 * Structures a cover letter can follow. Each one is a set of instructions in
 * the system prompt (see @piston/prompts), not a stored text template.
 */
export const coverLetterTemplates = [
  'classique',
  'vous_moi_nous',
  'percutante',
  'reconversion',
  'email',
] as const
export const CoverLetterTemplate = z.enum(coverLetterTemplates)
export type CoverLetterTemplate = z.infer<typeof CoverLetterTemplate>

export const coverLetterTemplateLabels: Record<CoverLetterTemplate, string> = {
  classique: 'Classique',
  vous_moi_nous: 'Vous, moi, nous',
  percutante: 'Percutante',
  reconversion: 'Reconversion',
  email: 'E-mail',
}

/** One-line explanation shown under each label in the template picker. */
export const coverLetterTemplateDescriptions: Record<CoverLetterTemplate, string> = {
  classique: 'Structure classique en 4 paragraphes, de 250 à 350 mots.',
  vous_moi_nous: "L'entreprise, ce que j'apporte, puis ce qu'on fera ensemble.",
  percutante: 'Courte (180 à 250 mots), avec une accroche chiffrée.',
  reconversion: 'Met en avant tes compétences transférables et explique ton changement de cap.',
  email: "Corps d'e-mail court prêt à coller, avec une ligne d'objet.",
}

/** Word-count range of each template. Used by the prompt and by the editor's counter. */
export const coverLetterWordTargets: Record<CoverLetterTemplate, { min: number; max: number }> = {
  classique: { min: 250, max: 350 },
  vous_moi_nous: { min: 250, max: 350 },
  percutante: { min: 180, max: 250 },
  reconversion: { min: 250, max: 350 },
  email: { min: 100, max: 180 },
}
