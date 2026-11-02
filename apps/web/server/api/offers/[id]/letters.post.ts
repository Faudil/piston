import { generations } from '@piston/db'
import { IdParam, ManualLetterBody } from '@piston/shared'

/**
 * Starts a letter the user writes themselves: a first version with only the
 * salutation and the closing. Claude is not called, so it costs no quota, and
 * no resume is needed until Claude is asked to go over it.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const { applicationId } = await readValidatedBody(event, zodValidator(ManualLetterBody))
  const offer = await getUserOffer(user.id, id)
  const application = applicationId
    ? await getApplicationForLetter(user.id, applicationId, offer.id)
    : null

  const [row] = await useDb()
    .insert(generations)
    .values({
      userId: user.id,
      kind: 'cover_letter',
      inputRefs: {
        offerId: offer.id,
        template: 'personnalise',
        manual: true,
        ...(application && { applicationId: application.id }),
      },
      output: { paragraphs: ['Madame, Monsieur,', 'Cordialement,', user.displayName] },
      model: 'manual',
    })
    .returning()
  setResponseStatus(event, 201)
  return toGeneration(row!)
})
