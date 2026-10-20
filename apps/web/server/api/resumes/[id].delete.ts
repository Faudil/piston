import { IdParam } from '@piston/shared'

/** Deletes a resume version. If it was the current one, the newest remaining one takes over. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  await deleteResume(user.id, id)
  return { ok: true }
})
