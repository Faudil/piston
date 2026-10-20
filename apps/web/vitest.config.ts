import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      {
        // API routes, run in plain Node with the stubs from test/server/setup.ts.
        test: {
          name: 'server',
          include: ['test/server/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['test/server/setup.ts'],
        },
      },
      // Components and composables, run inside a Nuxt environment.
      await defineVitestProject({
        test: {
          name: 'app',
          include: ['test/app/**/*.test.ts'],
          environment: 'nuxt',
          // Booting the Nuxt environment can take a while when Turborepo runs
          // every workspace's tests at the same time.
          hookTimeout: 60_000,
        },
      }),
    ],
  },
})
