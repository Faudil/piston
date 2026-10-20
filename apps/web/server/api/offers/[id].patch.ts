import { and, eq, jobOffers } from '@piston/db'
import { IdParam, UpdateOfferBody } from '@piston/shared'

/** Edits an offer. Only the given fields change; an empty `url` clears it. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const { url, ...rest } = await readValidatedBody(event, zodValidator(UpdateOfferBody))
  const [row] = await useDb()
    .update(jobOffers)
    .set({ ...rest, ...(url !== undefined && { url: url || null }) })
    .where(and(eq(jobOffers.id, id), eq(jobOffers.userId, user.id)))
    .returning()
  if (!row) throw createError({ statusCode: 404, message: 'Offre introuvable.' })
  return toJobOffer(row)
})
