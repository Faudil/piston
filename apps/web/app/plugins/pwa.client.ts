/**
 * PWA plumbing, client side only: registers the service worker (public/sw.js,
 * production builds only: in development hot reload and cached files fight),
 * and catches the browser's « install » offer before any component asks.
 */
export default defineNuxtPlugin(() => {
  const install = useInstallPrompt()
  install.listen()

  if (import.meta.dev || !('serviceWorker' in navigator)) return
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker non enregistré', error)
    })
  }
  // After load, so registering never competes with the page for bandwidth
  // (the page may already be loaded by the time hydration runs).
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
})
