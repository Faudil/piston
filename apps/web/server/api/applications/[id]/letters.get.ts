import { IdParam } from '@piston/shared'

/** Every cover letter version written for one application, newest first. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  // 404 for an unknown application or another user's one.
  await getApplicationForUser(user.id, id)
  return listApplicationLetters(user.id, id)
})
