/** An invitation link outside the weekly quota of regular members. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const invite = await createAdminInvite(admin.id)
  const url = new URL(`/invite/${invite.token}`, getRequestURL(event).origin).toString()
  return { url, expiresAt: invite.expiresAt.toISOString() }
})
