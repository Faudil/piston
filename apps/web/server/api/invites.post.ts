/** Any logged-in user can invite a friend (5 links per week). Returns the link to share. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const invite = await createInviteWithQuota(user.id)
  const url = new URL(`/invite/${invite.token}`, getRequestURL(event).origin).toString()
  return { url, expiresAt: invite.expiresAt.toISOString() }
})
