/** The user's own 24 h usage and limits, and how much of the server's monthly budget is used. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return getUsageSummary(user.id)
})
