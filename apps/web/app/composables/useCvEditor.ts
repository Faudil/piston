import type { CvDocument, UpdateCvDocumentBody } from '@piston/shared'

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
 */
export function useCvEditor(initial: CvDocument) {
  const state = reactive<EditableState>(clone(pick(initial)))
  const updatedAt = ref(initial.updatedAt)
  const status = ref<CvSaveStatus>('saved')
  const errorMessage = ref<string | null>(null)

  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<CvDocument | null> | null = null
  /** Set while state is replaced programmatically (restore), so it is not saved back. */
  let silent = false

  watch(
    () => [state.title, state.templateId, state.content, state.design],
    () => {
      if (silent || status.value === 'conflict') return
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
    updatedAt.value = document.updatedAt
    status.value = 'saved'
    void nextTick(() => (silent = false))
  }

  /** Saves pending changes, e.g. before leaving the page or exporting. */
  async function flush() {
    if (status.value === 'pending' || status.value === 'error') await save()
    else if (inFlight) await inFlight
  }

  onBeforeUnmount(() => {
    if (status.value === 'pending') void save()
  })

  return { state, updatedAt, status, errorMessage, save, replace, flush }
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
