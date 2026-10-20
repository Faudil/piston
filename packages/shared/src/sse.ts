import type { GenerationKind } from './enums'
import type { Generation } from './models'

/**
 * Events sent by the `/api/generate/*` routes over Server-Sent Events.
 * Each SSE message has `event: <type>` and `data: <JSON payload>`.
 */
export type GenerationEvent =
  /** A chunk of text as Claude writes it (raw JSON for structured outputs). */
  | { type: 'delta'; text: string }
  /** The finished generation, validated and saved in the database. */
  | { type: 'done'; generation: Generation<GenerationKind> }
  /** A user-facing error message in French. */
  | { type: 'error'; message: string }
