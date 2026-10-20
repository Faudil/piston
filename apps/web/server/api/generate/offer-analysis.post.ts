import { buildUserMessage, offerAnalysisPrompt } from '@piston/prompts'
import { OfferAnalysisBody, OfferAnalysisOutput } from '@piston/shared'

/** Compares a job offer with the current resume: score, skills, interview questions, jargon. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { offerId } = await readValidatedBody(event, zodValidator(OfferAnalysisBody))
  const offer = await getUserOffer(user.id, offerId)
  const resume = await getResumeForGeneration(user.id)

  const { resume: resumeBlock, request } = buildUserMessage({
    resume: resume.rawText,
    offer: offerForPrompt(offer),
    instruction: 'Analyze this job offer against my resume.',
  })

  return streamGeneration(event, {
    kind: 'offer_analysis',
    userId: user.id,
    system: offerAnalysisPrompt({ displayName: user.displayName }),
    resume: resumeBlock,
    request,
    inputRefs: { resumeId: resume.id, offerId: offer.id },
    output: { schema: OfferAnalysisOutput },
  })
})
