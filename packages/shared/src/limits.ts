/** Input size limits enforced on every route that accepts user text or files. */
export const LIMITS = {
  /** Maximum length of a resume or job offer, in characters. */
  maxTextLength: 20_000,
  /** Maximum size of an imported PDF, in bytes (5 MB). */
  maxPdfBytes: 5 * 1024 * 1024,
  /** Invitation links expire after this many days. */
  inviteValidityDays: 7,
  /** Invitation links one user may create per rolling 7 days. */
  invitesPerUserPerWeek: 5,
  /** Tavily calls (searches and page imports) per user per rolling 24 hours. */
  webCallsPerUserPerDay: 50,
  /** Pending access requests kept at once: past this, /demande refuses new ones (spam guard). */
  maxPendingAccessRequests: 30,
} as const
