/** Every PDF file starts with these bytes ("%PDF-"), whatever its extension or MIME type says. */
const PDF_MAGIC = '%PDF-'

export function looksLikePdf(data: Uint8Array): boolean {
  return Buffer.from(data.subarray(0, PDF_MAGIC.length)).toString('latin1') === PDF_MAGIC
}

/**
 * Extracts the plain text of a PDF, in memory. The file itself is never
 * written anywhere: only the text is kept.
 *
 * Throws a French 400 error when the file cannot be read. Returns an empty
 * string for scanned PDFs (images only, no text layer): the caller decides
 * what to tell the user.
 */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  // Loaded on first use: pdf.js is heavy and needs a native canvas module, so a
  // problem there must break PDF import only, not the whole server at startup.
  const { PDFParse } = await import('pdf-parse')
  // pdf.js takes ownership of (detaches) the buffer it is given: pass a copy so
  // the caller can still store the original bytes afterwards.
  const parser = new PDFParse({ data: new Uint8Array(data) })
  try {
    const { text } = await parser.getText()
    return normalizeExtractedText(text)
  } catch (error) {
    console.error('[pdf] text extraction failed', error)
    throw createError({
      statusCode: 400,
      message: "Impossible de lire ce PDF. Vérifie qu'il n'est pas protégé ou abîmé.",
    })
  } finally {
    await parser.destroy()
  }
}

/**
 * pdf-parse separates pages with "-- 1 of 2 --" markers and keeps trailing
 * spaces: strip both so the stored text looks like what the user would paste.
 */
function normalizeExtractedText(text: string): string {
  return text
    .replace(/^-- \d+ of \d+ --$/gm, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
