import { IdParam } from '@piston/shared'

/** Deletes a member's account and all their data. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  await deleteMember(id, admin.id)
  return { ok: true }
})
