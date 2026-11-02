import { AdminUserPatchBody, IdParam } from '@piston/shared'

/** Grants or removes the admin role, and sets the member's AI budget. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const { isAdmin, aiDailyBudgetUsd } = await readValidatedBody(
    event,
    zodValidator(AdminUserPatchBody),
  )
  if (isAdmin !== undefined) await setAdmin(id, isAdmin, admin.id)
  if (aiDailyBudgetUsd !== undefined) await setAiBudget(id, aiDailyBudgetUsd)
  return { ok: true }
})
