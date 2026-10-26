import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const pdfParseRequire = createRequire(require.resolve('pdf-parse'))

/** The CV fonts (WOFF, Latin + Latin Extended), shipped by @piston/cv-render. */
const cvFontsDir = fileURLToPath(new URL('../../packages/cv-render/fonts', import.meta.url))

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: true },

  // No anonymous usage telemetry. This also skips Nuxt's interactive consent
  // prompt, which would hang non-interactive runs (CI, Docker builds).
  telemetry: false,

  // The end-to-end build (`bun run e2e:build`) uses its own folder, so it
  // never overwrites the .nuxt of a running `bun dev`.
  buildDir: process.env.NUXT_E2E_BUILD_DIR || '.nuxt',

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
    // Global caps over all users (see server/utils/usage.ts).
    claudeGlobalDailyLimit: Number(process.env.CLAUDE_GLOBAL_DAILY_LIMIT || 300),
    claudeMonthlyBudgetUsd: Number(process.env.CLAUDE_MONTHLY_BUDGET_USD || 25),
    tavilyGlobalDailyLimit: Number(process.env.TAVILY_GLOBAL_DAILY_LIMIT || 300),
    tavilyMonthlyCredits: Number(process.env.TAVILY_MONTHLY_CREDITS || 1000),
    // Optional: enables job search and offer import from a link.
    tavilyApiKey: process.env.TAVILY_API_KEY ?? '',
    // Read the client IP from X-Forwarded-For (set TRUST_PROXY=true only behind
    // exactly one reverse proxy, see server/utils/throttle.ts).
    trustProxy: process.env.TRUST_PROXY === 'true',
    // Send the CSP as report-only (see server/middleware/01-security-headers.ts).
    cspReportOnly: process.env.CSP_REPORT_ONLY === 'true',
    // Merged into nuxt-auth-utils' defaults (httpOnly, secure, sameSite=lax).
    // maxAge is in seconds and counted from login, not renewed on activity.
    session: { maxAge: Number(process.env.SESSION_MAX_AGE || 60 * 60 * 24 * 30) },
  },

  nitro: {
    preset: 'bun',
    // The CV fonts, from one directory for both sides: bundled with the
    // server as assets (`useStorage('assets:cv-fonts')`, PDF exports), and
    // served to the browser at /cv-fonts/ (the preview's Web Worker).
    serverAssets: [{ baseName: 'cv-fonts', dir: cvFontsDir }],
    publicAssets: [
      // Names are not hashed: rename a file if its content ever changes.
      { dir: cvFontsDir, baseURL: '/cv-fonts', maxAge: 60 * 60 * 24 * 30 },
    ],
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
