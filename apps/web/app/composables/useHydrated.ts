/**
 * `false` during SSR and until the page is hydrated, then `true`.
 *
 * Forms that hold a password disable their submit button until then: before
 * hydration, pressing Enter would trigger a native GET submission and put the
 * password in the URL.
 */
export function useHydrated() {
  const hydrated = ref(false)
  onMounted(() => {
    hydrated.value = true
  })
  return hydrated
}
