import * as z from 'zod'

/**
 * Public (no session, see server/middleware/auth.ts): the PDF of a shared CV,
 * rendered on the fly. Only the PDF is ever served, never the JSON document.
 */
export default defineEventHandler(async (event) => {
  const { token } = await getValidatedRouterParams(
    event,
    zodValidator(z.object({ token: z.string().max(100) })),
  )
  const { download } = await getValidatedQuery(
    event,
    zodValidator(z.object({ download: z.enum(['0', '1']).optional() })),
  )
  const { link, document } = await resolveShareLink(token)
  consumeShareView(token)

  const pdf = await renderCvDocumentPdf(link.userId, document)
  await recordShareView(link.id)
  const filename = cvPdfFilename(document.content, document.title)
  setResponseHeaders(event, {
    'content-type': 'application/pdf',
    'content-disposition':
      download === '1'
        ? attachmentHeader(filename)
        : attachmentHeader(filename).replace(/^attachment/, 'inline'),
    'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex, nofollow',
  })
  return Buffer.from(pdf)
})
