import type { UsageSummary } from '@piston/shared'

/** The user's quota, shared by the page: refreshed after each generation. */
export function useUsage() {
  const usage = useState<UsageSummary | null>('usage', () => null)

  async function refresh() {
    try {
      usage.value = await $fetch<UsageSummary>('/api/usage')
    } catch {
      // A hint only: the server enforces the quota either way.
    }
  }

  return { usage, refresh }
}
