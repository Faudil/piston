import pdfmake from 'pdfmake'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { nodeFontLoader } from '../src/node'
import type { CvPdfEngine } from '../src'

/** The Node build of pdfmake with this package's fonts, as the server uses it. */
export const engine: CvPdfEngine = {
  pdfmake: pdfmake as unknown as CvPdfEngine['pdfmake'],
  loadFont: nodeFontLoader(),
}

/**
 * The text of a PDF in drawing order, which is the order an ATS reads it:
 * one line per text line, pages separated by a blank line.
 */
export async function pdfText(pdf: Uint8Array): Promise<string> {
  // pdf.js detaches the buffer it parses: give it a copy.
  const document = await getDocument({ data: pdf.slice(), verbosity: 0 }).promise
  const pages: string[] = []
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number)
    const { items } = await page.getTextContent()
    let text = ''
    for (const item of items) {
      if (!('str' in item)) continue
      text += item.str + (item.hasEOL ? '\n' : '')
    }
    pages.push(text)
  }
  await document.destroy()
  return pages.join('\n\n')
}
