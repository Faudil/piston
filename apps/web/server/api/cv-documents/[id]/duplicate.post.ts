import { DuplicateCvDocumentBody, IdParam } from '@piston/shared'

/** Copies a CV document, e.g. to tailor the copy to an offer and keep the original. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const body = await readValidatedBody(event, (raw) =>
    zodValidator(DuplicateCvDocumentBody)(raw ?? {}),
  )
  const row = await duplicateCvDocument(user.id, id, body)
  setResponseStatus(event, 201)
  return toCvDocument(row)
})
