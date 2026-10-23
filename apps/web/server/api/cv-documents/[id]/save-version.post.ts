import { IdParam, SaveCvVersionBody } from '@piston/shared'

/**
 * « Enregistrer comme version du CV »: the document's PDF and its text become
 * the new current version of its profile, so reviews, analyses and letters
 * use it like any imported resume.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const body = await readValidatedBody(event, (raw) => zodValidator(SaveCvVersionBody)(raw ?? {}))
  const row = await saveCvDocumentAsVersion(user.id, id, body.title)
  setResponseStatus(event, 201)
  return toResume(row)
})
