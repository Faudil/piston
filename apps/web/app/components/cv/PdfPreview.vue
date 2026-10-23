<script setup lang="ts">
/**
 * Displays a CV document's real PDF, rendered with pdf.js on canvases. The
 * PDF is the single source of truth of every template: what is shown here is
 * exactly what gets downloaded. `<iframe>` is not used because Chrome on
 * Android downloads PDFs instead of showing them.
 *
 * pdf.js is loaded on first use (legacy build, for older phones); the
 * previous pages stay on screen until the new ones are drawn, so the preview
 * does not flicker on every autosave.
 */
const props = withDefaults(
  defineProps<{
    /** URL of the PDF. Change it (e.g. `?v=updatedAt`) to re-render. */
    src: string
    /** Render only the first N pages (template thumbnails). */
    maxPages?: number
    /** Accessible description of the preview. */
    label?: string
  }>(),
  { maxPages: undefined, label: 'Aperçu du CV' },
)

const emit = defineEmits<{ pages: [count: number] }>()

const container = ref<HTMLElement | null>(null)
const pagesHost = ref<HTMLElement | null>(null)
const loading = ref(true)
const hasPages = ref(false)
const error = ref<string | null>(null)
let renderToken = 0

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjsPromise: Promise<PdfJs> | undefined

function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default
    return pdfjs
  })
  return pdfjsPromise
}

async function render() {
  const token = ++renderToken
  const host = pagesHost.value
  const width = container.value?.clientWidth ?? 0
  if (!host || !width) return
  loading.value = true
  error.value = null
  try {
    const pdfjs = await loadPdfJs()
    const response = await fetch(props.src, { credentials: 'same-origin' })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.message ?? 'Impossible de charger l’aperçu.')
    }
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await response.arrayBuffer()) })
      .promise
    if (token !== renderToken) return
    emit('pages', pdf.numPages)

    const count = props.maxPages ? Math.min(props.maxPages, pdf.numPages) : pdf.numPages
    const ratio = window.devicePixelRatio || 1
    const canvases: HTMLCanvasElement[] = []
    for (let number = 1; number <= count; number++) {
      const page = await pdf.getPage(number)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: (width / base.width) * ratio })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = '100%'
      canvas.setAttribute('aria-hidden', 'true')
      canvas.className = 'block rounded-sm bg-white shadow-sm ring-1 ring-black/5'
      await page.render({ canvas, viewport }).promise
      if (token !== renderToken) return
      canvases.push(canvas)
    }
    host.replaceChildren(...canvases)
    hasPages.value = canvases.length > 0
    await pdf.destroy()
  } catch (err) {
    if (token === renderToken)
      error.value = (err as Error).message || 'Impossible d’afficher l’aperçu.'
  } finally {
    if (token === renderToken) loading.value = false
  }
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined
let lastWidth = 0
let observer: ResizeObserver | undefined

onMounted(() => {
  render()
  observer = new ResizeObserver(([entry]) => {
    const width = Math.round(entry?.contentRect.width ?? 0)
    if (!width || Math.abs(width - lastWidth) < 24) return
    lastWidth = width
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(render, 250)
  })
  if (container.value) observer.observe(container.value)
})

onBeforeUnmount(() => {
  renderToken++
  observer?.disconnect()
  clearTimeout(resizeTimer)
})

watch(() => props.src, render)
</script>

<template>
  <div ref="container" class="relative" role="img" :aria-label="label" :aria-busy="loading">
    <div
      ref="pagesHost"
      class="space-y-4"
      :class="{ 'aspect-[210/297] rounded-sm bg-elevated': !hasPages }"
    />
    <div
      v-if="loading"
      class="pointer-events-none absolute inset-x-0 top-2 flex justify-center"
      aria-hidden="true"
    >
      <span
        class="flex items-center gap-2 rounded-full bg-default/90 px-3 py-1 text-xs text-muted shadow-sm ring-1 ring-default"
      >
        <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
        Mise à jour…
      </span>
    </div>
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="error"
      class="mt-2"
    />
  </div>
</template>
