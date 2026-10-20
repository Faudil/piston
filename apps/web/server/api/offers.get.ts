import { desc, eq, jobOffers } from '@piston/db'

/** The user's job offers, newest first. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const rows = await useDb()
    .select()
    .from(jobOffers)
    .where(eq(jobOffers.userId, user.id))
    .orderBy(desc(jobOffers.createdAt))
  return rows.map(toJobOffer)
})
