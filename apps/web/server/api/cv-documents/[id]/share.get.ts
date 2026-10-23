import { IdParam } from '@piston/shared'

/** The share links of a CV document, newest first. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  return listShareLinks(user.id, id)
})
