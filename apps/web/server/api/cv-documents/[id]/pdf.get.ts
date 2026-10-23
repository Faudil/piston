import { CvPdfQuery, IdParam } from '@piston/shared'

/**
 * The PDF of a saved CV document, inline (the editor's preview) or as an
 * attachment (`download=1`). `templateId` renders it with another template,
 * for the template gallery's thumbnails.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const query = await getValidatedQuery(event, zodValidator(CvPdfQuery))
  const document = await getUserCvDocument(user.id, id)

  const pdf = await renderCvDocumentPdf(user.id, {
    ...document,
    templateId: query.templateId ?? document.templateId,
  })
  const filename = cvPdfFilename(document.content, document.title)
  setResponseHeaders(event, {
    'content-type': 'application/pdf',
    'content-disposition':
      query.download === '1'
        ? attachmentHeader(filename)
        : attachmentHeader(filename).replace(/^attachment/, 'inline'),
    'cache-control': 'private, no-store',
  })
  return Buffer.from(pdf)
})
