<script setup lang="ts">
import type { CvContentBox } from '@piston/cv-render'

/**
 * Displays a CV's real PDF, drawn with pdf.js on canvases: what is shown is
 * exactly what gets downloaded. `<iframe>` is not used because Chrome on
 * Android downloads PDFs instead of showing them.
 *
 * The PDF comes either as bytes (`data`, from the render worker: the live
 * preview) or from a URL (`src`, e.g. the server route). pdf.js is loaded on
 * first use (legacy build, for older phones); the previous pages stay on
 * screen until the new ones are drawn, so the preview does not flicker.
 *
 * For click-to-edit, a click on a page emits `point` with its position in
 * PDF points (top-left origin, like `CvContentBox`), and `highlight` draws
 * boxes over the pages.
 */
const props = withDefaults(
  defineProps<{
    /** URL of the PDF. Change it (e.g. `?v=updatedAt`) to re-render. */
    src?: string
    /** The PDF itself; takes precedence over `src`. */
    data?: Uint8Array | null
    /** Render only the first N pages (template thumbnails). */
    maxPages?: number
    /** Accessible description of the preview. */
    label?: string
    /** Shows the « Mise à jour… » badge, e.g. while the worker renders. */
    busy?: boolean
    /** Boxes to outline on the pages (the field being edited). */
    highlight?: CvContentBox[]
  }>(),
  {
    src: undefined,
    data: undefined,
    maxPages: undefined,
    label: 'Aperçu du CV',
    busy: false,
    highlight: () => [],
  },
)

const emit = defineEmits<{
  pages: [count: number]
  point: [point: { page: number; x: number; y: number }]
}>()

const container = ref<HTMLElement | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
/** Drawn pages: canvas and size in PDF points. */
const pages = shallowRef<Array<{ canvas: HTMLCanvasElement; width: number; height: number }>>([])
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

async function bytes(): Promise<Uint8Array | null> {
  // pdf.js transfers (detaches) the buffer it parses: always give it a copy.
  if (props.data) return props.data.slice()
  if (!props.src) return null
  const response = await fetch(props.src, { credentials: 'same-origin' })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.message ?? 'Impossible de charger l’aperçu.')
  }
  return new Uint8Array(await response.arrayBuffer())
}

async function render() {
  const token = ++renderToken
  const width = container.value?.clientWidth ?? 0
  if (!width) return
  loading.value = true
  error.value = null
  try {
    const data = await bytes()
    if (!data) return
    const pdfjs = await loadPdfJs()
    const pdf = await pdfjs.getDocument({ data }).promise
    if (token !== renderToken) return
    emit('pages', pdf.numPages)

    const count = props.maxPages ? Math.min(props.maxPages, pdf.numPages) : pdf.numPages
    const ratio = window.devicePixelRatio || 1
    const drawn: typeof pages.value = []
    for (let number = 1; number <= count; number++) {
      const page = await pdf.getPage(number)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: (width / base.width) * ratio })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.className = 'block w-full'
      canvas.setAttribute('aria-hidden', 'true')
      await page.render({ canvas, viewport }).promise
      if (token !== renderToken) return
      drawn.push({ canvas, width: base.width, height: base.height })
    }
    pages.value = drawn
    await pdf.destroy()
  } catch (err) {
    if (token === renderToken)
      error.value = (err as Error).message || 'Impossible d’afficher l’aperçu.'
  } finally {
    if (token === renderToken) loading.value = false
  }
}

/** Mounts each canvas into its page wrapper (canvases are drawn off-DOM). */
const pageHosts = ref<HTMLElement[]>([])
watch(
  [pages, pageHosts],
  () => {
    pages.value.forEach((page, index) => {
      const host = pageHosts.value[index]
      if (host && host.firstChild !== page.canvas) host.replaceChildren(page.canvas)
    })
  },
  { flush: 'post' },
)

function onPageClick(event: MouseEvent, index: number) {
  const page = pages.value[index]
  const target = event.currentTarget as HTMLElement
  if (!page) return
  const rect = target.getBoundingClientRect()
  emit('point', {
    page: index + 1,
    x: ((event.clientX - rect.left) / rect.width) * page.width,
    y: ((event.clientY - rect.top) / rect.height) * page.height,
  })
}

/** A highlight box as CSS percentages of its page. */
function boxStyle(box: CvContentBox) {
  const page = pages.value[box.page - 1]
  if (!page) return { display: 'none' }
  return {
    left: `${(box.x / page.width) * 100}%`,
    top: `${(box.y / page.height) * 100}%`,
    width: `${(box.width / page.width) * 100}%`,
    height: `${(box.height / page.height) * 100}%`,
  }
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined
let lastWidth = 0
let observer: ResizeObserver | undefined

onMounted(() => {
  void render()
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

watch(() => [props.src, props.data], render)
</script>

<template>
  <div ref="container" class="relative" role="img" :aria-label="label" :aria-busy="loading || busy">
    <div v-if="pages.length" class="space-y-4">
      <div
        v-for="(page, index) in pages"
        :key="index"
        class="relative overflow-hidden rounded-sm bg-white shadow-sm ring-1 ring-black/5"
        @click="onPageClick($event, index)"
      >
        <div ref="pageHosts" />
        <div
          v-for="(box, boxIndex) in highlight.filter((entry) => entry.page === index + 1)"
          :key="boxIndex"
          class="pointer-events-none absolute rounded-sm bg-primary/10 ring-2 ring-primary/60"
          :style="boxStyle(box)"
          aria-hidden="true"
        />
      </div>
    </div>
    <!-- Skeleton until the first PDF is drawn (pdfmake and the fonts load in the worker). -->
    <div
      v-else
      class="aspect-[210/297] animate-pulse rounded-sm bg-elevated p-[8%]"
      aria-hidden="true"
    >
      <div class="h-[4%] w-1/2 rounded bg-accented/60" />
      <div class="mt-[3%] h-[2%] w-1/3 rounded bg-accented/50" />
      <div v-for="line in 7" :key="line" class="mt-[6%] space-y-[2%]">
        <div class="h-[1.6%] w-1/4 rounded bg-accented/50" />
        <div class="h-[1.2%] w-full rounded bg-accented/40" />
        <div class="h-[1.2%] w-5/6 rounded bg-accented/40" />
      </div>
    </div>
    <div
      v-if="loading || busy"
      class="pointer-events-none absolute inset-x-0 top-2 flex justify-center"
      aria-hidden="true"
    >
      <span
        class="flex items-center gap-2 rounded-full bg-default/90 px-3 py-1 text-xs text-muted shadow-sm ring-1 ring-default"
      >
        <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
        {{ pages.length ? 'Mise à jour…' : 'Préparation de l’aperçu…' }}
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
