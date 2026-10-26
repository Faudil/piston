import type { CvAssets, CvRenderInput } from '@piston/cv-render'
import {
  cvSampleAssets,
  cvTemplateSampleContent,
  cvTemplates,
  type CvDesign,
  type CvTemplateId,
} from '@piston/shared'

/**
 * Template thumbnails: the first page of a CV rendered by the page's CV
 * worker (channel `thumb:<templateId>`), drawn with pdf.js onto a canvas and
 * kept as an image URL.
 *
 * Two kinds: the built-in sample CV (same for everyone, cached in memory and
 * in IndexedDB) and the user's own content (memory only: it changes while
 * they edit). Renders go through one queue so the worker is never flooded
 * and a template's two requests (sample, then own) never replace each other.
 */

/** Bump to invalidate every cached thumbnail (renderer changes). */
const CACHE_VERSION = 2
const THUMBNAIL_WIDTH = 360
const MEMORY_LIMIT = 80

/** FNV-1a: a short key for a JSON string. */
function hash(text: string): string {
  let value = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 0x01000193)
  }
  return (value >>> 0).toString(36)
}

const memory = new Map<string, string>()
const remember = (key: string, url: string) => {
  memory.set(key, url)
  if (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value!)
}

// --- IndexedDB (sample thumbnails only); every call may fail: it is a cache ----

const DB_NAME = 'piston-cv-thumbnails'
let dbPromise: Promise<IDBDatabase | null> | undefined

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore('thumbnails')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

async function stored(key: string): Promise<string | null> {
  try {
    const db = await openDb()
    if (!db) return null
    return await new Promise((resolve) => {
      const request = db.transaction('thumbnails').objectStore('thumbnails').get(key)
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null)
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function store(key: string, url: string): Promise<void> {
  try {
    const db = await openDb()
    db?.transaction('thumbnails', 'readwrite').objectStore('thumbnails').put(url, key)
  } catch {
    // The cache is optional.
  }
}

// --- Drawing --------------------------------------------------------------------

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

/** First page of a PDF as an image URL (WebP when supported, else PNG). */
async function firstPageImage(pdf: Uint8Array): Promise<string> {
  const pdfjs = await loadPdfJs()
  const document = await pdfjs.getDocument({ data: pdf.slice() }).promise
  try {
    const page = await document.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const viewport = page.getViewport({ scale: (THUMBNAIL_WIDTH / base.width) * ratio })
    const canvas = window.document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    await page.render({ canvas, viewport }).promise
    const webp = canvas.toDataURL('image/webp', 0.88)
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png')
  } finally {
    await document.destroy()
  }
}

// --- Composable ---------------------------------------------------------------------

export interface CvThumbnailSource {
  templateId: CvTemplateId
  design: CvDesign
  /** The user's content; the built-in sample when absent. */
  content?: CvRenderInput['content']
  assets?: CvAssets
}

export function useCvThumbnails() {
  const { render } = useCvRenderWorker()
  let queue: Promise<unknown> = Promise.resolve()

  /** The sample CV, in the template's recommended section order, with its drawn photo. */
  function sampleContent(templateId: CvTemplateId) {
    return cvTemplateSampleContent(cvTemplates[templateId])
  }

  function cacheKey(source: CvThumbnailSource, own: boolean): string {
    const template = hash(JSON.stringify(cvTemplates[source.templateId]))
    const body = own ? hash(JSON.stringify(source.content)) : 'sample'
    return `v${CACHE_VERSION}:${source.templateId}:${template}:${hash(JSON.stringify(source.design))}:${body}`
  }

  /** The image URL if already known, without rendering. */
  function cached(source: CvThumbnailSource): string | null {
    return memory.get(cacheKey(source, Boolean(source.content))) ?? null
  }

  /**
   * Renders (or finds in a cache) the thumbnail. Resolves with null when the
   * render fails or was replaced: the caller keeps what it shows.
   */
  function thumbnail(source: CvThumbnailSource): Promise<string | null> {
    const own = Boolean(source.content)
    const key = cacheKey(source, own)
    const known = memory.get(key)
    if (known) return Promise.resolve(known)

    const job = queue.then(async () => {
      const inMemory = memory.get(key)
      if (inMemory) return inMemory
      if (!own) {
        const fromDb = await stored(key)
        if (fromDb) {
          remember(key, fromDb)
          return fromDb
        }
      }
      const input: CvRenderInput = {
        content: source.content ?? sampleContent(source.templateId),
        design: source.design,
        templateId: source.templateId,
      }
      const assets = source.assets ?? (own ? {} : cvSampleAssets())
      const result = await render(input, assets, `thumb:${source.templateId}`)
      if (!result) return null
      const url = await firstPageImage(result.pdf)
      remember(key, url)
      if (!own) void store(key, url)
      return url
    })
    queue = job.catch(() => null)
    return job.catch(() => null)
  }

  return { thumbnail, cached }
}
