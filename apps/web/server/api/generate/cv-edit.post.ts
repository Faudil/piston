import { cvEditPrompt, wrapCvDocument } from '@piston/prompts'
import {
  CvEditBody,
  CvEditOutput,
  CvQuestionsOutput,
  parseCvEditOutput,
  parseCvQuestionsOutput,
} from '@piston/shared'

/**
 * Streams Claude's proposal of edits on a CV document (kind `cv_edit`), for
 * the instruction box, an inline action, tailoring to an offer, or the
 * advice of a review, an issue of the coach panel, writing help (summary,
 * bullets, « Compléter cette section »), the translation of the CV or its
 * one-page version. Nothing is applied here: the user reviews every
 * operation and the accepted ones are saved with the document.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, zodValidator(CvEditBody))
  const document = await getUserCvDocument(user.id, body.documentId)
  const { request, inputRefs } = await buildCvEditRequest(user.id, document, body)

  return streamGeneration(event, {
    kind: 'cv_edit',
    userId: user.id,
    system: cvEditPrompt({ displayName: user.displayName }),
    resume: wrapCvDocument(document.content),
    request,
    inputRefs,
    // Invalid operations are dropped one by one instead of failing the proposal.
    // « Compléter cette section » first asks questions, which come back as a
    // proposal without operations (see CvEditProposal.questions).
    output:
      body.mode === 'complete' && !body.answers
        ? { format: CvQuestionsOutput, fromJson: parseCvQuestionsOutput }
        : { format: CvEditOutput, fromJson: parseCvEditOutput },
  })
})
