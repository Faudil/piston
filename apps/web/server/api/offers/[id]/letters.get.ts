import { IdParam } from '@piston/shared'

/**
 * Every cover letter version of an offer, newest first: the shared history of
 * the offer page and of its application's letter page.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  // 404 for an unknown offer or another user's one.
  await getUserOffer(user.id, id)
  return listOfferLetters(user.id, id)
})
