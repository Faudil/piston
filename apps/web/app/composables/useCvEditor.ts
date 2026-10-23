import type { CvDocument, UpdateCvDocumentBody } from '@piston/shared'
import { createCvHistory, restoreCvSnapshot, serializeCvSnapshot } from '~/utils/cv-history'

export type CvSaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict'

/** Fields of a document the editor changes. */
type EditableState = Pick<CvDocument, 'title' | 'templateId' | 'content' | 'design'>

const AUTOSAVE_DELAY_MS = 1000

/**
 * The CV builder's editing state: a deep reactive copy of the document that
 * the form fields edit directly, saved automatically one second after the
 * last change.
 *
 * Saves send the `updatedAt` last received, so a second tab gets a conflict
 * instead of silently overwriting (`status === 'conflict'`). The server's
 * answer only updates `updatedAt` (which also refreshes the preview): the
 * local state is never replaced while the user types.
 *
 * Undo / redo (`undo`, `redo`) walk a bounded history of snapshots of the
 * template, content and design (see utils/cv-history.ts). Restoring a
 * snapshot is an ordinary change of the state, so autosave, the preview and
 * the 409 guard behave as for any edit. Revisions stay the long-term history.
 */
export function useCvEditor(initial: CvDocument) {
  const state = reactive<EditableState>(clone(pick(initial)))
  const updatedAt = ref(initial.updatedAt)
  const status = ref<CvSaveStatus>('saved')
  const errorMessage = ref<string | null>(null)

  const history = createCvHistory(serializeCvSnapshot(state))
  const canUndo = ref(false)
  const canRedo = ref(false)
  /** Set while an undo or redo is applied, so the watcher does not record it as an edit. */
  let restoring = false
  let lastTemplateId = state.templateId
  const syncHistoryFlags = () => {
    // After a conflict the local state is out of date: undoing would only deepen it.
    canUndo.value = history.canUndo() && status.value !== 'conflict'
    canRedo.value = history.canRedo() && status.value !== 'conflict'
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<CvDocument | null> | null = null
  /** Set while state is replaced programmatically (restore), so it is not saved back. */
  let silent = false

  watch(
    () => [state.title, state.templateId, state.content, state.design],
    () => {
      if (silent) return
      const snapshot = serializeCvSnapshot(state)
      if (restoring) {
        // The restored state may differ from the snapshot (the photo is kept).
        history.setPresent(snapshot)
        restoring = false
      } else {
        // A template switch is one deliberate step, not part of a typing burst.
        history.record(snapshot, performance.now(), {
          separate: state.templateId !== lastTemplateId,
        })
      }
      lastTemplateId = state.templateId
      syncHistoryFlags()
      if (status.value === 'conflict') return
      status.value = 'pending'
      clearTimeout(timer)
      timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS)
    },
    { deep: true },
  )

  /**
   * Saves now (cancelling a pending autosave). With `snapshot`, the server
   * also records a revision (AI edits accepted, template change...).
   */
  async function save(snapshot?: UpdateCvDocumentBody['snapshot']): Promise<CvDocument | null> {
    // Let the watcher see a change made just before this call, then cancel its autosave.
    await nextTick()
    clearTimeout(timer)
    // One save at a time: the next one is based on the `updatedAt` this one returns.
    if (inFlight) await inFlight
    if (status.value === 'conflict') return null
    status.value = 'saving'
    errorMessage.value = null
    inFlight = (async () => {
      try {
        const saved = await $fetch<CvDocument>(`/api/cv-documents/${initial.id}`, {
          method: 'PATCH',
          body: { ...toRaw(state), baseUpdatedAt: updatedAt.value, ...(snapshot && { snapshot }) },
        })
        updatedAt.value = saved.updatedAt
        // Changes typed during the request are saved by their own pending timer.
        if (status.value === 'saving') status.value = 'saved'
        return saved
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode
        status.value = code === 409 ? 'conflict' : 'error'
        syncHistoryFlags()
        errorMessage.value = apiErrorMessage(
          err,
          'Enregistrement impossible. Vérifie ta connexion.',
        )
        return null
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }

  /** Replaces the whole state with a document from the server (after a restore), without saving it. */
  function replace(document: CvDocument) {
    silent = true
    Object.assign(state, clone(pick(document)))
    lastTemplateId = state.templateId
    // The restore is one step that can be undone (the undo is saved like an edit).
    history.record(serializeCvSnapshot(state), performance.now(), { separate: true })
    syncHistoryFlags()
    updatedAt.value = document.updatedAt
    status.value = 'saved'
    void nextTick(() => (silent = false))
  }

  function applySnapshot(snapshot: string | null) {
    if (snapshot === null) return
    const next = restoreCvSnapshot(snapshot, state)
    restoring = true
    state.templateId = next.templateId
    state.content = next.content
    state.design = next.design
    syncHistoryFlags()
  }

  function undo() {
    if (status.value === 'conflict') return
    applySnapshot(history.undo())
  }

  function redo() {
    if (status.value === 'conflict') return
    applySnapshot(history.redo())
  }

  /** The next change starts a new undo step (call before applying an accepted proposal). */
  function breakUndoStep() {
    history.breakBurst()
  }

  /** Saves pending changes, e.g. before leaving the page or exporting. */
  async function flush() {
    if (status.value === 'pending' || status.value === 'error') await save()
    else if (inFlight) await inFlight
  }

  onBeforeUnmount(() => {
    if (status.value === 'pending') void save()
  })

  return {
    state,
    updatedAt,
    status,
    errorMessage,
    save,
    replace,
    flush,
    undo,
    redo,
    canUndo,
    canRedo,
    breakUndoStep,
  }
}

function pick(document: CvDocument): EditableState {
  return {
    title: document.title,
    templateId: document.templateId,
    content: document.content,
    design: document.design,
  }
}

/** Deep copy of plain JSON data (structuredClone rejects Vue's reactive proxies). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
