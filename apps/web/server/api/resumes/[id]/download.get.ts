import { and, eq, resumes } from '@piston/db'
import { IdParam } from '@piston/shared'

/**
 * Downloads a resume: the original PDF when it was imported from one, the
 * pasted text as a .txt file otherwise. 404 for other users' resumes.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const row = await useDb().query.resumes.findFirst({
    where: and(eq(resumes.id, id), eq(resumes.userId, user.id)),
  })
  if (!row) throw createError({ statusCode: 404, message: 'CV introuvable.' })

  const file = resumeDownload(row)
  setResponseHeaders(event, {
    'content-type': file.type,
    'content-disposition': attachmentHeader(file.filename),
    'cache-control': 'private, no-store',
  })
  return typeof file.body === 'string' ? file.body : Buffer.from(file.body)
})
