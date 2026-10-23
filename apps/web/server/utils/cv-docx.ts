import { renderCvDocx } from '@piston/cv-render/docx'
import type { CvContent, CvDesign, CvTemplateId } from '@piston/shared'

export const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** The Word file of a CV document (structure and styles, not pixel-perfect). */
export async function buildCvDocx(document: {
  content: CvContent
  design: CvDesign
  templateId: CvTemplateId
}): Promise<Uint8Array> {
  try {
    return await renderCvDocx(document)
  } catch (error) {
    console.error('[cv-docx] export failed', error)
    throw createError({
      statusCode: 500,
      message: 'Impossible de générer le fichier Word de ce CV. Réessaie dans un instant.',
    })
  }
}

/** « Camille Durand - CV.docx », or the document title when the name is empty. */
export function cvDocxFilename(content: CvContent, title: string): string {
  return cvPdfFilename(content, title).replace(/\.pdf$/, '.docx')
}
