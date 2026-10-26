import { defineConfig, devices } from '@playwright/test'

const PORT = 3200
/** The e2e database: its name must end with `_e2e` (e2e-seed.ts resets it on every run). */
const databaseUrl =
  process.env.E2E_DATABASE_URL ?? 'postgres://piston:piston@localhost:5432/piston_e2e'

/**
 * End-to-end tests: they drive the real, built app (`nuxt build` output) with
 * a real Postgres, and the fake Claude/Tavily of apps/web/server/utils/fake-ai.ts
 * (NUXT_E2E_FAKE_AI=1), so no API key and no network are needed.
 *
 * `bun run e2e` builds once, then runs this config; `bun run e2e:run` reuses
 * the last build. Port 3200, never the development server on 3000.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]]
    : [['list']],
  // Tests share one database and one user: run them one after the other.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    // Locally, PW_CHROMIUM_PATH can point to any installed Chromium.
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    // Reset and seed the database first, then start the built server.
    // --no-env-file: never pick up a developer's .env (real API keys).
    command:
      'bun --no-env-file packages/db/src/e2e-seed.ts && bun --no-env-file apps/web/.output/server/index.mjs',
    cwd: '..',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      DATABASE_URL: databaseUrl,
      NUXT_DATABASE_URL: databaseUrl,
      MIGRATIONS_DIR: 'packages/db/drizzle',
      NUXT_SESSION_PASSWORD: 'e2e-session-password-at-least-32-characters-long',
      NUXT_E2E_FAKE_AI: '1',
      NUXT_ANTHROPIC_API_KEY: '',
      NUXT_TAVILY_API_KEY: '',
      NUXT_DAILY_GENERATION_LIMIT: '200',
      // Not "production": the fakes refuse to run with NODE_ENV=production.
      NODE_ENV: 'test',
      PORT: String(PORT),
      HOST: '127.0.0.1',
    },
  },
})
