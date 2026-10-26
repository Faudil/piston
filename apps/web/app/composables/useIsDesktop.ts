/**
 * Whether the viewport is at least `lg` (1024 px), the width from which the
 * CV editor shows the preview beside the form. `true` on the server and until
 * mounted, matching the CSS-only layout (`lg:` classes) that the server
 * renders; use it only to avoid mounting something heavy twice.
 */
export function useIsDesktop() {
  const isDesktop = ref(true)
  onMounted(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => (isDesktop.value = query.matches)
    update()
    query.addEventListener('change', update)
    onBeforeUnmount(() => query.removeEventListener('change', update))
  })
  return isDesktop
}
