import {
  renderPdf,
  type CvAssets,
  type CvPdfEngine,
  type CvPdfMake,
  type CvRenderInput,
} from '@piston/cv-render'
import type { CvContent } from '@piston/shared'

/**
 * Server-side CV PDFs (download, « Enregistrer comme version », gallery
 * fallback), rendered by @piston/cv-render, the same renderer as the
 * editor's preview (which runs it in a Web Worker).
 *
 * The fonts are Nitro server assets (`assets:cv-fonts`, mapped to
 * packages/cv-render/fonts in nuxt.config.ts): bundled with the server, read
 * through `useStorage`, so the production output needs no `packages/` dir.
 */

let pdfmakeReady: Promise<CvPdfMake> | undefined

/**
 * Loads pdfmake on first use: like pdf-parse, a problem there breaks PDF
 * export only, never the server start. The renderer registers the fonts and
 * denies every URL and file access on first render.
 */
function usePdfMake(): Promise<CvPdfMake> {
  pdfmakeReady ??= import('pdfmake')
    .then((module) => module.default as unknown as CvPdfMake)
    .catch((error) => {
      pdfmakeReady = undefined
      throw error
    })
  return pdfmakeReady
}

async function loadFont(file: string): Promise<Uint8Array> {
  const data = await useStorage('assets:cv-fonts').getItemRaw<Uint8Array>(file)
  if (!data) throw new Error(`[cv-pdf] missing font asset ${file}`)
  return new Uint8Array(data)
}

/**
 * At most this many PDFs are rendered at once per process. A render takes
 * ~100-300 ms and a few tens of MB; the queue keeps memory flat under a
 * burst of exports.
 */
const MAX_CONCURRENT_RENDERS = 2
let activeRenders = 0
const waitingRenders: Array<() => void> = []

async function acquireRenderSlot() {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders++
    return
  }
  // The slot is handed over by `releaseRenderSlot`, so the count stays exact.
  await new Promise<void>((resolve) => waitingRenders.push(resolve))
}

function releaseRenderSlot() {
  const next = waitingRenders.shift()
  if (next) next()
  else activeRenders--
}

/**
 * Runs `render` with the shared pdfmake instance and the fonts, one of
 * `MAX_CONCURRENT_RENDERS` at a time. For other PDFs drawn with the CV
 * engine (the matching cover letter).
 */
export async function withCvPdfEngine<T>(
  label: string,
  render: (engine: CvPdfEngine) => Promise<T>,
): Promise<T> {
  await acquireRenderSlot()
  try {
    return await render({ pdfmake: await usePdfMake(), loadFont })
  } catch (error) {
    console.error(`[cv-pdf] ${label} failed`, error)
    throw createError({
      statusCode: 500,
      message: 'Impossible de générer le PDF. Réessaie dans un instant.',
    })
  } finally {
    releaseRenderSlot()
  }
}

/** Renders a CV document to PDF bytes. `assets` holds its photo (see `loadCvRenderAssets`). */
export async function renderCvPdf(
  input: CvRenderInput,
  assets: CvAssets = {},
): Promise<Uint8Array> {
  await acquireRenderSlot()
  try {
    const pdfmake = await usePdfMake()
    const result = await renderPdf(input, assets, { pdfmake, loadFont })
    return result.pdf
  } catch (error) {
    console.error('[cv-pdf] render failed', error)
    throw createError({
      statusCode: 500,
      message: 'Impossible de générer le PDF de ce CV. Réessaie dans un instant.',
    })
  } finally {
    releaseRenderSlot()
  }
}

/** Renders one of the user's stored documents, its photo included. */
export async function renderCvDocumentPdf(
  userId: string,
  document: CvRenderInput & { id: string },
): Promise<Uint8Array> {
  const assets = await loadCvRenderAssets(userId, document.id, document.content)
  return renderCvPdf(document, assets)
}

/** « Camille Durand - CV.pdf », or the document title when the name is empty. */
export function cvPdfFilename(content: CvContent, title: string): string {
  const name = content.header.fullName.trim() || title.trim() || 'CV'
  return `${name} - CV.pdf`
}
