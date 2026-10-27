/**
 * `GET /api/_auth/session` (used by the pages and during SSR) answers from
 * the cookie alone. Drop the user from that answer when the session is stale
 * (see currentSessionUser), so the UI logs out instead of failing on API
 * calls, and refresh the admin flag, so a role granted or revoked from the
 * command line shows up without logging in again.
 */
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session, event) => {
    const current = await currentSessionUser(session)
    if (current) {
      if (session.user) session.user.isAdmin = current.isAdmin
      return
    }
    delete session.user
    delete session.sessionVersion
    await clearUserSession(event)
  })
})
