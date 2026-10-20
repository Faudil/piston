import { jobOffers } from '@piston/db'
import { CreateOfferBody } from '@piston/shared'

/** Saves a pasted job offer. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, zodValidator(CreateOfferBody))
  const [row] = await useDb()
    .insert(jobOffers)
    .values({
      userId: user.id,
      title: body.title,
      company: body.company,
      rawText: body.rawText,
      // The form sends an empty string when the link field is left blank.
      url: body.url || null,
    })
    .returning()
  setResponseStatus(event, 201)
  return toJobOffer(row!)
})
