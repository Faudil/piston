import type { Features } from '@piston/shared'

/**
 * Optional server features (e.g. Tavily web search), fetched once and shared
 * by every component through the `features` key. A failed call (older server,
 * network error) means "everything off": the UI simply hides those parts.
 */
export function useFeatures() {
  const { data } = useFetch<Features>('/api/features', {
    key: 'features',
    default: () => ({ webSearch: false }),
    // Same answer for the whole session: no need to refetch on navigation.
    getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
  })
  return { webSearch: computed(() => data.value.webSearch) }
}
