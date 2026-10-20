import { IdParam } from '@piston/shared'

/** Makes one of the user's resume versions the current one. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  return toResume(await setCurrentResume(user.id, id))
})
