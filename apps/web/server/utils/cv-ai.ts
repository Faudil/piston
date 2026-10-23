import { and, desc, eq, generations, sql } from '@piston/db'
import {
  cvActionRequest,
  cvInstructionRequest,
  cvReviewRequest,
  cvTailorRequest,
  wrapOffer,
} from '@piston/prompts'
import type { CvContent, CvEditBody, CvEditScope, GenerationInputRefs } from '@piston/shared'

/**
 * Checks that an action's scope points at something that exists in the
 * document (the user may have deleted it since opening the menu).
 */
export function assertCvScope(content: CvContent, scope: CvEditScope) {
  const gone = () =>
    createError({
      statusCode: 400,
      message: 'Cet élément n’existe plus dans ton CV. Recharge la page.',
    })
  if (!scope.section || scope.section === 'summary') {
    if (scope.itemId) throw gone()
    return
  }
  if (!scope.itemId) return
  const item = (
    content[scope.section] as Array<{ id: string; bullets?: Array<{ id: string }> }>
  ).find((entry) => entry.id === scope.itemId)
  if (!item) throw gone()
  if (scope.bulletId && !item.bullets?.some((bullet) => bullet.id === scope.bulletId)) throw gone()
}

/**
 * The review to turn into edits: the given one (the user's, kind
 * resume_review), else the latest review of the document's profile.
 */
async function getReviewForCv(userId: string, profileId: string, reviewGenerationId?: string) {
  const conditions = [eq(generations.userId, userId), eq(generations.kind, 'resume_review')]
  if (reviewGenerationId) conditions.push(eq(generations.id, reviewGenerationId))
  else conditions.push(sql`${generations.inputRefs}->>'profileId' = ${profileId}`)
  const [review] = await useDb()
    .select()
    .from(generations)
    .where(and(...conditions))
    .orderBy(desc(generations.createdAt))
    .limit(1)
  if (!review) {
    throw reviewGenerationId
      ? createError({ statusCode: 404, message: 'Critique introuvable.' })
      : createError({
          statusCode: 400,
          message:
            'Ce profil n’a pas encore de critique. Enregistre ce CV comme version, lance une critique sur la page CV, puis reviens.',
        })
  }
  return review
}

/**
 * The variable part of a CV edit request (the task, with the user's texts in
 * their tags) and the references stored with the proposal. Checks that the
 * scope, the offer and the review exist and are the user's.
 */
export async function buildCvEditRequest(
  userId: string,
  document: { id: string; profileId: string; content: CvContent },
  body: CvEditBody,
): Promise<{ request: string; inputRefs: GenerationInputRefs }> {
  const base: GenerationInputRefs = {
    cvDocumentId: document.id,
    profileId: document.profileId,
    cvMode: body.mode,
  }
  switch (body.mode) {
    case 'instruction':
      return { request: cvInstructionRequest(body.instruction), inputRefs: base }
    case 'action':
      assertCvScope(document.content, body.scope)
      return {
        request: cvActionRequest(body.action, body.scope),
        inputRefs: { ...base, cvAction: body.action },
      }
    case 'tailor': {
      const offer = await getUserOffer(userId, body.offerId)
      return {
        request: cvTailorRequest(wrapOffer(offerForPrompt(offer))),
        inputRefs: { ...base, offerId: offer.id },
      }
    }
    case 'review': {
      const review = await getReviewForCv(userId, document.profileId, body.reviewGenerationId)
      return {
        request: cvReviewRequest(review.output),
        inputRefs: { ...base, reviewGenerationId: review.id },
      }
    }
  }
}
