import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Each test file boots an in-memory Postgres (PGlite, WebAssembly) and
    // applies every migration: a few seconds on a shared CI runner.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
