/**
 * `GET /api/_auth/session` (used by the pages and during SSR) answers from
 * the cookie alone. Drop the user from that answer when the session is stale
 * (see isSessionCurrent), so the UI logs out instead of failing on API calls.
 */
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session, event) => {
    if (await isSessionCurrent(session)) return
    delete session.user
    delete session.sessionVersion
    await clearUserSession(event)
  })
})
