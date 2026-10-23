import { IdParam } from '@piston/shared'

/** One of the user's CV documents, with its content and design. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  return toCvDocument(await getUserCvDocument(user.id, id))
})
