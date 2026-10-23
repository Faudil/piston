import { IdParam } from '@piston/shared'

/** The CV as a Word file (.docx): its structure and styles, not a pixel-perfect copy of the PDF. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const document = await getUserCvDocument(user.id, id)

  const docx = await buildCvDocx(document)
  setResponseHeaders(event, {
    'content-type': DOCX_CONTENT_TYPE,
    'content-disposition': attachmentHeader(cvDocxFilename(document.content, document.title)),
    'cache-control': 'private, no-store',
  })
  return Buffer.from(docx)
})
