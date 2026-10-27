import { AdminUserPatchBody, IdParam } from '@piston/shared'

/** Grants or removes the admin role. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const { isAdmin } = await readValidatedBody(event, zodValidator(AdminUserPatchBody))
  await setAdmin(id, isAdmin, admin.id)
  return { ok: true }
})
