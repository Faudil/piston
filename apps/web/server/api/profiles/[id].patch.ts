import { IdParam, UpdateProfileBody } from '@piston/shared'

/** Renames a resume profile and/or makes it the default one. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const changes = await readValidatedBody(event, zodValidator(UpdateProfileBody))
  await updateProfile(user.id, id, changes)
  const profiles = await listProfiles(user.id)
  return profiles.find((profile) => profile.id === id)!
})
