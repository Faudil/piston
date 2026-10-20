import { IdParam } from '@piston/shared'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  return toJobOffer(await getUserOffer(user.id, id))
})
