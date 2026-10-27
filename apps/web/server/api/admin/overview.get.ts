/** Totals for the admin dashboard: members, content, and Claude/Tavily spending. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return getAdminOverview()
})
