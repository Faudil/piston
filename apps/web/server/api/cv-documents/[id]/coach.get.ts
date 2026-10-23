import { IdParam, type CvCoachResponse } from '@piston/shared'

/**
 * What the coach panel shows besides the live checks: the latest review (and
 * its ATS check) of the document's profile. Nothing is generated here.
 */
export default defineEventHandler(async (event): Promise<CvCoachResponse> => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const document = await getUserCvDocument(user.id, id)
  return { review: await getCvCoachReview(user.id, document) }
})
