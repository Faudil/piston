import { IdParam } from '@piston/shared'

/** Sets a temporary password, returned once, and logs the member out everywhere. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  return { password: await resetMemberPassword(id) }
})
