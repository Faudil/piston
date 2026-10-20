import { and, eq, jobOffers } from '@piston/db'
import { IdParam } from '@piston/shared'

/**
 * Deletes an offer (its application goes with it, by cascade). Generations are
 * kept: history is append-only and they only reference the offer by id.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const deleted = await useDb()
    .delete(jobOffers)
    .where(and(eq(jobOffers.id, id), eq(jobOffers.userId, user.id)))
    .returning({ id: jobOffers.id })
  if (deleted.length === 0) throw createError({ statusCode: 404, message: 'Offre introuvable.' })
  return { ok: true }
})
