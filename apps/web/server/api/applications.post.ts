import { and, applications, eq, jobOffers } from '@piston/db'
import { CreateApplicationBody } from '@piston/shared'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, zodValidator(CreateApplicationBody))
  const db = useDb()

  const [offer] = await db
    .select({ id: jobOffers.id, title: jobOffers.title, company: jobOffers.company })
    .from(jobOffers)
    .where(and(eq(jobOffers.id, body.jobOfferId), eq(jobOffers.userId, user.id)))
  if (!offer) throw createError({ statusCode: 404, message: 'Offre introuvable.' })

  const existing = await db.query.applications.findFirst({
    columns: { id: true },
    where: and(eq(applications.userId, user.id), eq(applications.jobOfferId, offer.id)),
  })
  if (existing) {
    throw createError({ statusCode: 409, message: 'Cette offre est déjà dans tes candidatures.' })
  }

  const [row] = await db
    .insert(applications)
    .values({
      userId: user.id,
      jobOfferId: offer.id,
      notes: body.notes,
      status: 'to_send',
      statusHistory: [{ status: 'to_send', at: new Date().toISOString() }],
    })
    .returning()
  setResponseStatus(event, 201)
  return toApplication(row!, offer)
})
