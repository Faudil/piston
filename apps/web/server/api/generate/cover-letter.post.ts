import { buildUserMessage, coverLetterParagraphPrompt, coverLetterPrompt } from '@piston/prompts'
import { CoverLetterBody } from '@piston/shared'

/**
 * Writes a cover letter for an offer, or rewrites a single paragraph of an
 * existing one (`regenerateParagraph`). Either way the result is saved as a
 * new generation: history is append-only, the parent is kept in inputRefs.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { offerId, tone, highlights, regenerateParagraph } = await readValidatedBody(
    event,
    zodValidator(CoverLetterBody),
  )
  const offer = await getUserOffer(user.id, offerId)
  const resume = await getResumeForGeneration(user.id)

  if (regenerateParagraph) {
    await getUserCoverLetter(user.id, regenerateParagraph.generationId)
    if (regenerateParagraph.index >= regenerateParagraph.paragraphs.length) {
      throw createError({ statusCode: 400, message: "Ce paragraphe n'existe pas." })
    }
  }

  const { resume: resumeBlock, request } = buildUserMessage({
    resume: resume.rawText,
    offer: offerForPrompt(offer),
    instruction: coverLetterInstruction(highlights, Boolean(regenerateParagraph)),
  })

  return streamGeneration(event, {
    kind: 'cover_letter',
    userId: user.id,
    system: regenerateParagraph
      ? coverLetterParagraphPrompt({
          displayName: user.displayName,
          tone,
          paragraphs: regenerateParagraph.paragraphs,
          index: regenerateParagraph.index,
        })
      : coverLetterPrompt({ displayName: user.displayName, tone }),
    resume: resumeBlock,
    request,
    inputRefs: {
      resumeId: resume.id,
      offerId: offer.id,
      tone,
      highlights,
      ...(regenerateParagraph && {
        parentGenerationId: regenerateParagraph.generationId,
        paragraphIndex: regenerateParagraph.index,
      }),
    },
    output: {
      // For a single paragraph Claude only writes the new one: merge it back
      // into the letter so every generation stores a complete letter.
      fromText: regenerateParagraph
        ? (text) => ({
            paragraphs: replaceParagraph(
              regenerateParagraph.paragraphs,
              regenerateParagraph.index,
              text,
            ),
          })
        : parseCoverLetter,
    },
  })
})
