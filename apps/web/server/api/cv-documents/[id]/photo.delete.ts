import { IdParam } from '@piston/shared'

/** Deletes the photo of a CV document. The editor then clears `content.header.photo`. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  await getUserCvDocument(user.id, id)
  await deleteCvAssets(user.id, id)
  return { ok: true }
})
