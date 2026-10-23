import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import { cvTemplates, resolveCvDesign } from '@piston/shared'
import { collectBoxes } from './engine/boxes'
import { computeTokens } from './engine/tokens'
import { cvPairingFamilies, prepareCvPdfMake } from './fonts'
import { renderResolved } from './render'
import type { CvAssets, CvFontLoader, CvPdfMake, CvRenderInput, CvRenderResult } from './types'

/** What `renderPdf` needs from its environment: a pdfmake instance and a way to read font files. */
export interface CvPdfEngine {
  pdfmake: CvPdfMake
  loadFont: CvFontLoader
}

interface Position {
  pageNumber: number
  top: number
}

/**
 * Renders a CV to PDF bytes, with its page count and content boxes. Loads
 * the fonts of the design's pairing first (once per pdfmake instance).
 *
 * Not reentrant per pdfmake instance only in the sense that pdfmake keeps
 * its fonts in a shared virtual file system: concurrent renders are fine.
 */
export async function renderPdf(
  input: CvRenderInput,
  assets: CvAssets,
  engine: CvPdfEngine,
): Promise<CvRenderResult> {
  const design = resolveCvDesign(cvTemplates[input.templateId], input.design)
  await prepareCvPdfMake(engine.pdfmake, cvPairingFamilies(design.fontPairing), engine.loadFont)
  const definition = renderResolved(input.content, design, assets)
  const buffer = await engine.pdfmake.createPdf(definition).getBuffer()
  // A copy with its own ArrayBuffer: it can be transferred out of a worker.
  const pdf = new Uint8Array(buffer)
  const tokens = computeTokens(design)
  return {
    pdf,
    ...layoutSummary(
      definition,
      tokens.page,
      tokens.margins,
      tokens.size.base * tokens.lineHeight * 1.2,
    ),
    boxes: collectBoxes(definition.content),
  }
}

/** Page count and last page fill, from the root node's positions after layout. */
function layoutSummary(
  definition: TDocumentDefinitions,
  page: { width: number; height: number },
  margins: { top: number; bottom: number },
  lineHeight: number,
): Pick<CvRenderResult, 'pageCount' | 'pageSize' | 'lastPageFill'> {
  const root = (definition.content as Array<{ positions?: Position[] }>)[0]
  const positions = root?.positions ?? []
  const pageCount = Math.max(1, ...positions.map((position) => position.pageNumber))
  const onLast = positions.filter((position) => position.pageNumber === pageCount)
  const inner = page.height - margins.top - margins.bottom
  const bottom = onLast.length
    ? Math.max(...onLast.map((position) => position.top)) + lineHeight
    : 0
  const lastPageFill = onLast.length ? Math.min(1, Math.max(0, (bottom - margins.top) / inner)) : 0
  return { pageCount, pageSize: page, lastPageFill: Math.round(lastPageFill * 100) / 100 }
}
