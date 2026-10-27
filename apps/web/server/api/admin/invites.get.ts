/** The 100 most recent invitations, with their state. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return listAdminInvites()
})
