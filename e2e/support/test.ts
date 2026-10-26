import { test as base, expect } from '@playwright/test'

/**
 * `test` with an automatic check: the run fails when the browser reports a
 * Content-Security-Policy violation or an uncaught page error. The e2e server
 * is a production build, so the CSP is enforced exactly as in production.
 */
export const test = base.extend<{ problems: undefined }>({
  problems: [
    async ({ context }, use) => {
      const problems: string[] = []
      const watch = (page: import('@playwright/test').Page) => {
        page.on('console', (message) => {
          if (/content security policy/i.test(message.text())) problems.push(message.text())
        })
        page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
      }
      context.on('page', watch)
      for (const page of context.pages()) watch(page)
      await use(undefined)
      expect(problems, 'CSP violations or uncaught page errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
