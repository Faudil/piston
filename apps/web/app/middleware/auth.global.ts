/**
 * Redirects to /login when there is no session. Runs on the server during
 * SSR and in the browser on every navigation. The API is protected on its own
 * by server/middleware/auth.ts.
 */
const PUBLIC_PAGES = ['/login']

export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  const isPublic = PUBLIC_PAGES.includes(to.path) || to.path.startsWith('/invite/')

  if (!loggedIn.value && !isPublic) {
    return navigateTo({
      path: '/login',
      query: to.fullPath !== '/' ? { redirect: to.fullPath } : {},
    })
  }
  if (loggedIn.value && isPublic) return navigateTo('/')
})
