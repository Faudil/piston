import * as z from 'zod'

/** Share links of a CV document (`/partage/<token>`): API shapes. */

/** How long a new link stays valid: 7 or 30 days, or `null` for no expiry. */
export const cvShareExpiryDays = [7, 30] as const

export const CreateCvShareLinkBody = z.object({
  expiresInDays: z
    .union([z.literal(7), z.literal(30)])
    .nullable()
    .default(null),
})
export type CreateCvShareLinkBody = z.infer<typeof CreateCvShareLinkBody>

/** A link as its owner sees it. The token is part of the URL the owner copies. */
export interface CvShareLink {
  id: string
  token: string
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  viewCount: number
}

/** What the public page may know about a link: nothing of the CV beyond its title. */
export interface CvShareInfo {
  title: string
}

/** Query of the matching letter PDF route. */
export const CvLetterPdfQuery = z.object({
  cvDocumentId: z.uuid().optional(),
  download: z.enum(['0', '1']).optional(),
})
export type CvLetterPdfQuery = z.infer<typeof CvLetterPdfQuery>
