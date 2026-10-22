import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfParseRequire = createRequire(require.resolve('pdf-parse'))

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: true },

  // No anonymous usage telemetry. This also skips Nuxt's interactive consent
  // prompt, which would hang non-interactive runs (CI, Docker builds).
  telemetry: false,

  modules: ['@nuxt/ui', '@nuxt/eslint', 'nuxt-auth-utils'],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      titleTemplate: '%s — Piston',
    },
  },

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
    // Optional: enables job search and offer import from a link.
    tavilyApiKey: process.env.TAVILY_API_KEY ?? '',
  },

  nitro: {
    preset: 'bun',
    externals: {
      // pdf-parse (pdf.js) loads its native canvas binding and its worker
      // script dynamically, which Nitro's file tracer cannot see: copy both
      // into .output, or PDF import fails in production only.
      traceInclude: [
        require.resolve('@napi-rs/canvas'),
        pdfParseRequire.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
      ],
    },
  },

  eslint: {
    config: {
      stylistic: false,
    },
  },
})
