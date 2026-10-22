import { CreateProfileBody } from '@piston/shared'

/** Creates an empty resume profile. The user's first profile becomes the default one. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { name } = await readValidatedBody(event, zodValidator(CreateProfileBody))
  const created = await createProfile(user.id, name)
  setResponseStatus(event, 201)
  const profiles = await listProfiles(user.id)
  return profiles.find((profile) => profile.id === created.id)!
})
