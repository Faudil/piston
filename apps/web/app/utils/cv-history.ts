import type { CvContent, CvDesign, CvTemplateId } from '@piston/shared'

/**
 * Undo / redo history of the CV editor, as a pure data structure: it stores
 * serialized snapshots (JSON strings, so they are immutable and cheap to
 * compare) and knows nothing about Vue or the document.
 *
 * Edits arriving close together are coalesced into one history entry, so a
 * burst of keystrokes is undone in one step, not one letter at a time.
 */
export interface CvHistoryOptions {
  /** Maximum number of undo steps kept (the oldest are dropped). */
  limit?: number
  /** A change less than this long after the previous one joins the same entry. */
  coalesceMs?: number
  /** A burst never lasts longer than this, however fast the user types. */
  maxBurstMs?: number
}

export interface CvHistory {
  /**
   * Records the new state. Returns false when it equals the current one.
   * `separate` forces a new entry (a template change, an accepted proposal).
   */
  record(snapshot: string, now: number, options?: { separate?: boolean }): boolean
  /** The previous state, or null when there is nothing to undo. */
  undo(): string | null
  /** The state that was undone, or null. */
  redo(): string | null
  /** Replaces the current state without making an entry (after an undo or redo was applied). */
  setPresent(snapshot: string): void
  /** Forgets everything and starts again from `snapshot`. */
  reset(snapshot: string): void
  /** The next `record` starts a new entry, whatever its timing. */
  breakBurst(): void
  canUndo(): boolean
  canRedo(): boolean
}

export function createCvHistory(initial: string, options: CvHistoryOptions = {}): CvHistory {
  const limit = options.limit ?? 100
  const coalesceMs = options.coalesceMs ?? 800
  const maxBurstMs = options.maxBurstMs ?? 8000

  let present = initial
  let past: string[] = []
  let future: string[] = []
  let lastAt = Number.NEGATIVE_INFINITY
  let burstStart = Number.NEGATIVE_INFINITY

  return {
    record(snapshot, now, { separate = false } = {}) {
      if (snapshot === present) return false
      const joins =
        !separate && now - lastAt < coalesceMs && now - burstStart < maxBurstMs && past.length > 0
      if (!joins) {
        past.push(present)
        if (past.length > limit) past = past.slice(past.length - limit)
        burstStart = now
      }
      present = snapshot
      future = []
      lastAt = now
      return true
    },
    undo() {
      const previous = past.pop()
      if (previous === undefined) return null
      future.push(present)
      present = previous
      lastAt = Number.NEGATIVE_INFINITY
      return present
    },
    redo() {
      const next = future.pop()
      if (next === undefined) return null
      past.push(present)
      present = next
      lastAt = Number.NEGATIVE_INFINITY
      return present
    },
    setPresent(snapshot) {
      present = snapshot
    },
    reset(snapshot) {
      present = snapshot
      past = []
      future = []
      lastAt = Number.NEGATIVE_INFINITY
    },
    breakBurst() {
      lastAt = Number.NEGATIVE_INFINITY
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  }
}

/** The parts of a document the history covers. */
export interface CvEditableSnapshot {
  templateId: CvTemplateId
  content: CvContent
  design: CvDesign
}

/**
 * Serializes the undoable part of a document. The header photo is left out:
 * uploading or removing it is an immediate server action (the file replaces
 * the previous one), so an undo cannot bring a deleted file back.
 */
export function serializeCvSnapshot(state: CvEditableSnapshot): string {
  return JSON.stringify({
    templateId: state.templateId,
    design: state.design,
    content: { ...state.content, header: { ...state.content.header, photo: null } },
  })
}

/** The state a snapshot describes, with the photo of `current` (never undone). */
export function restoreCvSnapshot(
  snapshot: string,
  current: CvEditableSnapshot,
): CvEditableSnapshot {
  const restored = JSON.parse(snapshot) as CvEditableSnapshot
  restored.content.header.photo = current.content.header.photo
    ? { ...current.content.header.photo }
    : null
  return restored
}
