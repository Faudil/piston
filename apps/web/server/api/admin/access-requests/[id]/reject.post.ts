import { IdParam } from '@piston/shared'

/** Closes the request; the password the requester chose is erased. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  await rejectAccessRequest(id, admin.id)
  return { ok: true }
})
