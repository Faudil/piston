/** Input size limits enforced on every route that accepts user text or files. */
export const LIMITS = {
  /** Maximum length of a resume or job offer, in characters. */
  maxTextLength: 20_000,
  /** Maximum size of an imported PDF, in bytes (5 MB). */
  maxPdfBytes: 5 * 1024 * 1024,
  /** Invitation links expire after this many days. */
  inviteValidityDays: 7,
} as const
