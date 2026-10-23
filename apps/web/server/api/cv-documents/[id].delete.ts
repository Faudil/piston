import { IdParam } from '@piston/shared'

/** Deletes a CV document and its history. Resume versions saved from it are kept. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  await deleteCvDocument(user.id, id)
  return { ok: true }
})
