/**
 * Refuses to start a production server with the end-to-end fakes enabled
 * (see utils/fake-ai.ts): isFakeAi() throws when NODE_ENV=production.
 */
export default defineNitroPlugin(() => {
  if (isFakeAi()) console.warn('[fake-ai] NUXT_E2E_FAKE_AI=1: Claude and Tavily are fakes')
})
