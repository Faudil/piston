import { CvDocumentsQuery } from '@piston/shared'

/** The user's CV documents (without their content), optionally for one profile. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { profileId } = await getValidatedQuery(event, zodValidator(CvDocumentsQuery))
  if (profileId) await getUserProfile(user.id, profileId)
  return listCvDocuments(user.id, profileId)
})
