import { IdParam } from '@piston/shared'

/**
 * Deletes a resume profile and its versions. Offers using it go back to the
 * default profile; if it was the default, the oldest remaining one takes over.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  await deleteProfile(user.id, id)
  return { ok: true }
})
