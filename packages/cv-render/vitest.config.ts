import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Rendering real PDFs (fonts loaded once per file) takes a few hundred ms.
    testTimeout: 60_000,
  },
})
