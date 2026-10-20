import {
  buildUserMessage,
  coverLetterParagraphPrompt,
  coverLetterPrompt,
  coverLetterRevisionPrompt,
} from '@piston/prompts'
import { CoverLetterBody } from '@piston/shared'

/**
 * Writes a cover letter for an offer, rewrites a single paragraph of an
 * existing one (`regenerateParagraph`), or revises a whole letter following
 * the user's corrections (`revision`). Every result is saved as a new
 * generation: history is append-only, the parent is kept in inputRefs.
 *
 * With `applicationId`, the letter is written for that application and its
 * notes are given to Claude as context.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, zodValidator(CoverLetterBody))
  const { offerId, tone, highlights, regenerateParagraph, revision } = body
  let { template, applicationId } = body
  const offer = await getUserOffer(user.id, offerId)

  if (regenerateParagraph) {
    const parent = await getUserCoverLetter(user.id, regenerateParagraph.generationId)
    if (regenerateParagraph.index >= regenerateParagraph.paragraphs.length) {
      throw createError({ statusCode: 400, message: "Ce paragraphe n'existe pas." })
    }
    // A rewritten paragraph belongs to its letter: keep that letter's template
    // and application, whichever page the rewrite was asked from.
    template = parent.inputRefs.template ?? template
    applicationId ??= parent.inputRefs.applicationId
  }

  const application = applicationId
    ? await getApplicationForLetter(user.id, applicationId, offer.id)
    : null
  const resume = await getResumeForGeneration(user.id)
  if (revision) await getUserCoverLetter(user.id, revision.generationId)

  const ctx = { displayName: user.displayName, tone, template }
  const task = revision ? 'revision' : regenerateParagraph ? 'paragraph' : 'letter'

  const { resume: resumeBlock, request } = buildUserMessage({
    resume: resume.rawText,
    offer: offerForPrompt(offer),
    instruction: coverLetterInstruction(task, highlights, application?.notes),
  })

  let system = coverLetterPrompt(ctx)
  if (regenerateParagraph) {
    system = coverLetterParagraphPrompt({
      ...ctx,
      paragraphs: regenerateParagraph.paragraphs,
      index: regenerateParagraph.index,
    })
  } else if (revision) {
    system = coverLetterRevisionPrompt({
      ...ctx,
      paragraphs: revision.paragraphs,
      instructions: revision.instructions,
    })
  }

  return streamGeneration(event, {
    kind: 'cover_letter',
    userId: user.id,
    system,
    resume: resumeBlock,
    request,
    inputRefs: {
      resumeId: resume.id,
      offerId: offer.id,
      tone,
      template,
      highlights,
      ...(application && { applicationId: application.id }),
      ...(regenerateParagraph && {
        parentGenerationId: regenerateParagraph.generationId,
        paragraphIndex: regenerateParagraph.index,
      }),
      ...(revision && {
        parentGenerationId: revision.generationId,
        revisionInstructions: revision.instructions,
      }),
    },
    output: {
      // For a single paragraph Claude only writes the new one: merge it back
      // into the letter so every generation stores a complete letter. A
      // revision is a complete letter, parsed like a new one.
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
