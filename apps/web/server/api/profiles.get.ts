/** Lists the user's resume profiles, oldest first, with their current version. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return listProfiles(user.id)
})
