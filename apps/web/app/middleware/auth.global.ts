/**
 * Redirects to /login when there is no session. Runs on the server during
 * SSR and in the browser on every navigation. The API is protected on its own
 * by server/middleware/auth.ts.
 */
const PUBLIC_PAGES = ['/login', '/demande']

export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user } = useUserSession()
  const isGuestPage = PUBLIC_PAGES.includes(to.path) || to.path.startsWith('/invite/')
  // A shared CV (/partage/:token) is for everyone, signed in or not.
  const isPublic = isGuestPage || to.path.startsWith('/partage/')

  if (!loggedIn.value && !isPublic) {
    return navigateTo({
      path: '/login',
      query: to.fullPath !== '/' ? { redirect: to.fullPath } : {},
    })
  }
  if (loggedIn.value && isGuestPage) return navigateTo('/')
  // A display hint only: every /api/admin route checks the role itself.
  if (to.path.startsWith('/admin') && !user.value?.isAdmin) return navigateTo('/')
})
