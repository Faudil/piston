import type { OnboardingHint } from '@piston/shared'

/**
 * First-use messages: the welcome dialog and the one-time page tips. What the
 * user closed is stored on their account and fetched once per visit (during
 * SSR, so a closed tip never flashes). Closing is optimistic: the message
 * disappears at once and the server is told in the background.
 */
export function useOnboarding() {
  const { loggedIn } = useUserSession()
  const dismissed = useState<OnboardingHint[] | null>('onboarding-dismissed', () => null)

  /** Loads the list once; later calls reuse it. */
  async function load() {
    if (dismissed.value !== null || !loggedIn.value) return
    try {
      const { dismissed: list } = await useRequestFetch()('/api/onboarding')
      dismissed.value = list
    } catch {
      // Unknown state: show nothing rather than messages the user may have closed.
      dismissed.value = [...onboardingAll]
    }
  }

  /** Whether `hint` should be shown. False until the list is known. */
  const isOpen = (hint: OnboardingHint) =>
    dismissed.value !== null && !dismissed.value.includes(hint)

  function dismiss(hint: OnboardingHint) {
    if (!dismissed.value || dismissed.value.includes(hint)) return
    dismissed.value = [...dismissed.value, hint]
    $fetch('/api/onboarding/dismiss', { method: 'POST', body: { hint } }).catch(() => {
      // Not saved: the message comes back on the next visit, which is harmless.
    })
  }

  async function reset() {
    await $fetch('/api/onboarding', { method: 'DELETE' })
    dismissed.value = []
  }

  return { load, isOpen, dismiss, reset }
}
