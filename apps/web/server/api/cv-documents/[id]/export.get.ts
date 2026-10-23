import { CvExportQuery, IdParam, cvToMarkdown, cvToText } from '@piston/shared'

const TYPES = {
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  json: 'application/json; charset=utf-8',
} as const

/** Exports a CV document as plain text, Markdown, or JSON (the document itself). */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const { format } = await getValidatedQuery(event, zodValidator(CvExportQuery))
  const document = await getUserCvDocument(user.id, id)

  const body =
    format === 'txt'
      ? cvToText(document.content, document.design)
      : format === 'md'
        ? cvToMarkdown(document.content, document.design)
        : `${JSON.stringify(
            {
              format: 'piston-cv',
              version: 1,
              title: document.title,
              templateId: document.templateId,
              design: document.design,
              content: document.content,
            },
            null,
            2,
          )}\n`
  const filename = cvPdfFilename(document.content, document.title).replace(/\.pdf$/, `.${format}`)
  setResponseHeaders(event, {
    'content-type': TYPES[format],
    'content-disposition': attachmentHeader(filename),
    'cache-control': 'private, no-store',
  })
  return body
})
