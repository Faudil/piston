import { CvLetterPdfQuery, IdParam } from '@piston/shared'

/**
 * A saved cover letter as a PDF in the design of one of the user's CV
 * documents (`cvDocumentId`; default: the latest CV of the offer's profile).
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const query = await getValidatedQuery(event, zodValidator(CvLetterPdfQuery))

  const { pdf, filename } = await renderMatchingLetter(user.id, id, query.cvDocumentId)
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
