import * as z from 'zod'

/** The four Claude-powered features. Also the value of `generations.kind`. */
export const generationKinds = [
  'resume_review',
  'offer_analysis',
  'cover_letter',
  'search_leads',
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
