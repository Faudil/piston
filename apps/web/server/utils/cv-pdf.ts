import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import type { CvContent, CvDesign, CvTemplateId } from '@piston/shared'
import { cvFontDictionary, cvFontFiles } from '../cv-pdf/fonts'
import { CV_TEMPLATES } from '../cv-pdf/templates'

/** The parts of pdfmake 0.3's server API used here (its types do not cover `virtualfs`). */
interface PdfMake {
  virtualfs: { writeFileSync(name: string, data: Buffer): void }
  setFonts(fonts: ReturnType<typeof cvFontDictionary>): void
  setUrlAccessPolicy(callback: (url: string) => boolean): void
  setLocalAccessPolicy(callback: (path: string) => boolean): void
  createPdf(definition: TDocumentDefinitions): { getBuffer(): Promise<Buffer> }
}

let pdfmakeReady: Promise<PdfMake> | undefined

/**
 * Loads pdfmake on first use (like pdf-parse, a problem there breaks PDF
 * export only, never the server start), registers the fonts from the server
 * assets, and forbids every remote or local resource: CV documents never
 * contain images, so nothing user-provided can make the server fetch a URL
 * or read a file.
 */
function usePdfMake(): Promise<PdfMake> {
  pdfmakeReady ??= (async () => {
    const pdfmake = (await import('pdfmake')).default as unknown as PdfMake
    const storage = useStorage('assets:server')
    for (const file of cvFontFiles()) {
      const data = await storage.getItemRaw<Uint8Array>(`cv-fonts:${file}`)
      if (!data) throw new Error(`[cv-pdf] missing font asset ${file}`)
      pdfmake.virtualfs.writeFileSync(file, Buffer.from(data))
    }
    pdfmake.setFonts(cvFontDictionary())
    pdfmake.setUrlAccessPolicy(() => false)
    pdfmake.setLocalAccessPolicy(() => false)
    return pdfmake
  })().catch((error) => {
    pdfmakeReady = undefined
    throw error
  })
  return pdfmakeReady
}

/**
 * At most this many PDFs are rendered at once per process. A render takes
 * ~100 ms and a few tens of MB; previews follow autosaves, so bursts are
 * possible, and the queue keeps memory flat.
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

export interface CvPdfInput {
  content: CvContent
  design: CvDesign
  templateId: CvTemplateId
}

/** Renders a CV document to PDF bytes with its template. */
export async function renderCvPdf(input: CvPdfInput): Promise<Uint8Array> {
  const pdfmake = await usePdfMake()
  const definition = CV_TEMPLATES[input.templateId]({
    content: input.content,
    design: input.design,
  })
  await acquireRenderSlot()
  try {
    const buffer = await pdfmake.createPdf(definition).getBuffer()
    return new Uint8Array(buffer)
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

/** « Camille Durand - CV.pdf », or the document title when the name is empty. */
export function cvPdfFilename(content: CvContent, title: string): string {
  const name = content.header.fullName.trim() || title.trim() || 'CV'
  return `${name} - CV.pdf`
}
