import { CreateResumeBody } from '@piston/shared'

/**
 * Creates a resume version from pasted text, in `profileId` or the default
 * profile. It becomes the current one of that profile.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, zodValidator(CreateResumeBody))
  const row = await createCurrentResume(user.id, body)
  setResponseStatus(event, 201)
  return toResume(row)
})
