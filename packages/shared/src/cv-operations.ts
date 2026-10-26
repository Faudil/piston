/**
 * Edits that Claude proposes on a CV document. Split by responsibility:
 *
 * - cv-operations-schema.ts: operation schemas, the wire format sent to
 *   Claude and its parsing.
 * - cv-operations-apply.ts: pure functions that apply operations.
 * - cv-operations-describe.ts: human-readable descriptions for the review UI.
 * - cv-diff.ts: word-level diff used by the review UI.
 *
 * This module only re-exports them so the public path stays stable.
 */
export * from './cv-operations-schema'
export {
  applyCvOperation,
  applyCvOperations,
  type CvApplyResult,
  type CvOperationResult,
} from './cv-operations-apply'
export * from './cv-operations-describe'
export * from './cv-diff'
