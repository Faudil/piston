/** Every member with their activity. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return listAdminUsers()
})
