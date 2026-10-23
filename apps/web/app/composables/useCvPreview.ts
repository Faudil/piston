import type { CvAssets, CvRenderInput, CvRenderResult } from '@piston/cv-render'

export type CvPreviewStatus = 'warming' | 'rendering' | 'ready' | 'error'

/** Delay after the last change before rendering: fast enough to feel live. */
const DEBOUNCE_MS = 150

/**
 * Live preview of a CV: renders `input` in the worker on every change
 * (debounced, latest wins) and exposes the last result (PDF bytes, page
 * count, content boxes). The previous result stays until the next one is
 * ready, so the preview never blinks.
 *
 * `status` is `warming` until the first render (pdfmake and the fonts load,
 * a few MB the first time), then `rendering` / `ready`, or `error` (with
 * `error`, a French message).
 */
export function useCvPreview(input: () => CvRenderInput, assets: () => CvAssets = () => ({})) {
  const { render } = useCvRenderWorker()
  const result = shallowRef<(CvRenderResult & { durationMs: number }) | null>(null)
  const status = ref<CvPreviewStatus>('warming')
  const error = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function run() {
    if (result.value) status.value = 'rendering'
    try {
      const next = await render(input(), assets())
      if (!next) return // replaced by a newer render
      result.value = next
      status.value = 'ready'
      error.value = null
    } catch (err) {
      status.value = 'error'
      error.value = (err as Error).message || 'Impossible de générer l’aperçu.'
    }
  }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(() => void run(), DEBOUNCE_MS)
  }

  onMounted(() => {
    void run()
    watch(input, schedule, { deep: true })
    watch(assets, schedule, { deep: true })
  })
  onBeforeUnmount(() => clearTimeout(timer))

  return { result, status, error, refresh: run }
}
