import { IdParam } from '@piston/shared'

/**
 * The photo of a CV document, as image bytes. The cache is private (it is
 * personal data) and revalidated with the asset id as ETag: replacing the
 * photo gives a new id, so a stale copy is never shown.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const asset = await getCvPhotoAsset(user.id, id)
  if (!asset) throw createError({ statusCode: 404, message: 'Aucune photo pour ce CV.' })

  const etag = `"${asset.id}"`
  setResponseHeaders(event, {
    'content-type': asset.mimeType,
    'cache-control': 'private, no-cache',
    etag,
    'x-content-type-options': 'nosniff',
  })
  if (getRequestHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return null
  }
  return Buffer.from(asset.bytes)
})
