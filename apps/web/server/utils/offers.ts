import { and, eq, jobOffers } from '@piston/db'
import type { JobOfferRow } from '@piston/db'

/** Returns one of the user's job offers, or throws a 404 (also for other users' offers). */
export async function getUserOffer(userId: string, offerId: string) {
  const offer = await useDb().query.jobOffers.findFirst({
    where: and(eq(jobOffers.id, offerId), eq(jobOffers.userId, userId)),
  })
  if (!offer) throw createError({ statusCode: 404, message: 'Offre introuvable.' })
  return offer
}

/**
 * The offer as given to Claude: the pasted text often lacks the job title or
 * the company name (they sit in the page header), so they are prepended.
 */
export function offerForPrompt(offer: JobOfferRow): string {
  const header = [offer.title, offer.company].filter(Boolean).join(' — ')
  return `${header}\n\n${offer.rawText}`
}
