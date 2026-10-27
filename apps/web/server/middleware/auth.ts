/**
 * Protects every API route by default. Only the routes listed here can be
 * called without a session. Pages are protected separately by the
 * app/middleware/auth.global.ts route middleware, which also runs during SSR.
 */
const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/access-requests',
  '/api/health',
  // Built-in nuxt-auth-utils endpoint used by useUserSession() to read the session.
  '/api/_auth/session',
]
// GET /api/invites/:token checks a link before sign-up; GET /api/partage/:token[/info] serves a shared CV.
const PUBLIC_API_PREFIXES = ['/api/invites/', '/api/partage/']

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return
  if (PUBLIC_API_ROUTES.includes(path)) return
  if (event.method === 'GET' && PUBLIC_API_PREFIXES.some((prefix) => path.startsWith(prefix)))
    return

  const session = await requireUserSession(event, { message: 'Connecte-toi pour continuer.' })
  const current = await currentSessionUser(session)
  if (!current) {
    // Deleted account, or password changed elsewhere: the cookie is dead.
    await clearUserSession(event)
    throw createError({ statusCode: 401, message: 'Ta session a expiré, reconnecte-toi.' })
  }
  // Admin routes also check the flag themselves (requireAdmin): this is the
  // first line, so no admin handler ever runs for a regular member.
  if (path.startsWith('/api/admin/') && !current.isAdmin) {
    throw createError({ statusCode: 403, message: 'Réservé aux administrateurs.' })
  }
})
