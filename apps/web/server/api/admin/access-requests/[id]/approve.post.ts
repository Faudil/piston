import { IdParam } from '@piston/shared'

/** Creates the requester's account. They can log in right away with their own password. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const result = await approveAccessRequest(id, admin.id)
  if (result.conflict) {
    throw createError({
      statusCode: 409,
      message: 'Un compte existe déjà avec cet e-mail : la demande a été close.',
    })
  }
  return { ok: true, userId: result.userId }
})
