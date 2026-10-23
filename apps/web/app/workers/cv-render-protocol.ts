import type { CvAssets, CvRenderInput, CvRenderResult } from '@piston/cv-render'

/**
 * Messages between the page and the CV render worker
 * (cv-render.worker.ts). Use them through `useCvRenderWorker`, not directly.
 *
 * Requests carry a `channel`: the worker keeps only the latest pending
 * request of each channel (« latest wins »), so a burst of edits renders
 * once, and the preview (`preview`) and gallery thumbnails (one channel per
 * thumbnail) do not cancel each other.
 */
export interface CvRenderRequest {
  type: 'render'
  id: number
  channel: string
  input: CvRenderInput
  assets: CvAssets
}

export type CvRenderResponse =
  | { type: 'rendered'; id: number; result: CvRenderResult; durationMs: number }
  /** A newer request of the same channel replaced this one before it started. */
  | { type: 'skipped'; id: number }
  | { type: 'error'; id: number; message: string }
