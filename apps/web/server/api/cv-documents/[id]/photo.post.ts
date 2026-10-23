import { IdParam } from '@piston/shared'

/**
 * Uploads the photo of a CV document (multipart field `file`, JPEG or PNG,
 * 2 MB at most; the editor crops and compresses it first) and replaces the
 * previous one. Answers with the asset: the editor puts its id in
 * `content.header.photo`.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  await getUserCvDocument(user.id, id)

  // Reject big uploads before reading them, when the client announces the size.
  const declaredLength = Number(getRequestHeader(event, 'content-length') ?? 0)
  if (declaredLength > CV_PHOTO_REQUEST_MAX_BYTES) throw tooLarge()

  const parts = (await readMultipartFormData(event)) ?? []
  const file = parts.find((part) => part.name === 'file' && part.filename)
  if (!file) throw createError({ statusCode: 400, message: 'Choisis une image.' })

  const asset = await replaceCvPhoto(user.id, id, file.data)
  setResponseStatus(event, 201)
  return asset
})

function tooLarge() {
  return createError({
    statusCode: 413,
    message: 'Cette image est trop lourde (2 Mo au maximum). Réduis-la et réessaie.',
  })
}
