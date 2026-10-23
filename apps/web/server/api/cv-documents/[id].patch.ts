import { IdParam, UpdateCvDocumentBody } from '@piston/shared'

/**
 * Saves changes to a CV document (autosave, AI edits accepted, template
 * change...). See `updateCvDocument` for conflicts and revisions.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const body = await readValidatedBody(event, zodValidator(UpdateCvDocumentBody))
  return toCvDocument(await updateCvDocument(user.id, id, body))
})
