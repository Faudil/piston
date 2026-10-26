import { ImportOfferBody } from '@piston/shared'

/** Fetches a job ad from its link and returns it cleaned up, without saving it. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, zodValidator(ImportOfferBody))
  const url = parsePublicUrl(body.url)
  if (!isWebSearchEnabled()) {
    throw createError({
      statusCode: 503,
      message: "La recherche web n'est pas configurée sur ce serveur.",
    })
  }
  return importOffer(user.id, url)
})
