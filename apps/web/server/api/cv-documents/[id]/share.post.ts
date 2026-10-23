import { CreateCvShareLinkBody, IdParam } from '@piston/shared'

/** Creates a share link (read-only PDF) for a CV document. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const body = await readValidatedBody(event, zodValidator(CreateCvShareLinkBody))
  setResponseStatus(event, 201)
  return createShareLink(user.id, id, body.expiresInDays)
})
