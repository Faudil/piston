import { IdParam } from '@piston/shared'

/** One application of the user with its offer (used by the letter page). */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const { application, offer } = await getApplicationForUser(user.id, id)
  return toApplication(application, offer)
})
