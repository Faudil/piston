import type { Generation, GenerationEvent, GenerationKind, GenerationOutputs } from '@piston/shared'

const ROUTES: Record<GenerationKind, string> = {
  resume_review: '/api/generate/resume-review',
  offer_analysis: '/api/generate/offer-analysis',
  cover_letter: '/api/generate/cover-letter',
  search_leads: '/api/generate/search-leads',
  cv_draft: '/api/generate/cv-draft',
  cv_edit: '/api/generate/cv-edit',
}

/**
 * Calls one of the `/api/generate/*` routes and exposes its Server-Sent
 * Events stream as reactive state:
 *
 * - `text`: everything Claude has written so far (raw JSON for structured kinds)
 * - `partial`: best-effort parse of `text`, to render structured results live
 * - `generation`: the saved generation once the stream is done
 * - `pending` / `error`
 *
 * `EventSource` only supports GET, so the stream is read with `fetch`.
 */
export function useGeneration<K extends GenerationKind>(kind: K) {
  const text = ref('')
  const generation = shallowRef<Generation<K> | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)
  let controller: AbortController | null = null

  const partial = computed(() =>
    kind === 'cover_letter' ? undefined : parsePartialJson<GenerationOutputs[K]>(text.value),
  )

  async function start(body: Record<string, unknown> = {}): Promise<Generation<K> | null> {
    abort()
    controller = new AbortController()
    text.value = ''
    generation.value = null
    error.value = null
    pending.value = true

    try {
      const response = await fetch(ROUTES[kind], {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      // Errors raised before streaming starts (validation, rate limit...) are plain JSON.
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.message ?? 'La génération a échoué.')
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        // SSE messages are separated by a blank line.
        const messages = buffer.split('\n\n')
        buffer = messages.pop() ?? ''
        for (const message of messages) handle(message)
      }
      if (!generation.value && !error.value) error.value = 'La génération a été interrompue.'
    } catch (err) {
      if ((err as Error).name !== 'AbortError') error.value = (err as Error).message
    } finally {
      pending.value = false
      controller = null
    }
    return generation.value
  }

  function handle(message: string) {
    const data = message
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6))
      .join('\n')
    if (!data) return
    const event = JSON.parse(data) as GenerationEvent
    if (event.type === 'delta') text.value += event.text
    else if (event.type === 'done') generation.value = event.generation as Generation<K>
    else if (event.type === 'error') error.value = event.message
  }

  function abort() {
    controller?.abort()
  }

  /** Stops any stream and forgets its result, e.g. when the page switches to another resume. */
  function reset() {
    abort()
    text.value = ''
    generation.value = null
    error.value = null
  }

  onScopeDispose(abort)

  return { start, abort, reset, text, partial, generation, pending, error }
}
