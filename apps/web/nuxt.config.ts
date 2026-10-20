// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxt/eslint', 'nuxt-auth-utils'],

  css: ['~/assets/css/main.css'],

  typescript: {
    strict: true,
  },

  // Server-only secrets. Every key can be overridden at runtime with a
  // NUXT_-prefixed environment variable (e.g. NUXT_ANTHROPIC_API_KEY), which is
  // how the production Docker image receives them. The process.env fallbacks
  // only apply when the config is evaluated, i.e. during `bun dev`.
  runtimeConfig: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
    databaseUrl: process.env.DATABASE_URL ?? '',
    dailyGenerationLimit: Number(process.env.DAILY_GENERATION_LIMIT || 30),
  },

  nitro: {
    preset: 'bun',
  },

  eslint: {
    config: {
      stylistic: false,
    },
  },
})
