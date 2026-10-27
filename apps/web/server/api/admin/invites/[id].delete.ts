import { IdParam } from '@piston/shared'

/** Revokes an invitation that has not been used yet. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  await revokeInvite(id)
  return { ok: true }
})
