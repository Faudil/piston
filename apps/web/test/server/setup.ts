/**
 * Test harness for Nitro server routes.
 *
 * In the real app, Nitro auto-imports h3 helpers (defineEventHandler,
 * readValidatedBody...), nuxt-auth-utils helpers and everything exported from
 * server/utils. Under Vitest nothing is auto-imported, so this file exposes the
 * same names as globals: real h3 functions, real server utils, and test
 * doubles for the session, the runtime config, the database and Claude.
 *
 * Route files can then be imported and called as-is through an h3 app (see
 * `callRoute` in ./helpers.ts).
 */
import { readFile } from 'node:fs/promises'
import * as h3 from 'h3'
import { CV_FONTS_DIR } from '@piston/cv-render/node'
import { vi } from 'vitest'
import { testState } from './state'

for (const [name, value] of Object.entries(h3)) vi.stubGlobal(name, value)

// Every util is exposed, so a new file in server/utils needs no registration here.
// db.ts (replaced by the PGlite double below) and the Nitro-only files stay out.
const utils = import.meta.glob(
  ['../../server/utils/*.ts', '!../../server/utils/{db,logger,security-headers}.ts'],
  { eager: true },
)
for (const util of Object.values(utils)) {
  for (const [name, value] of Object.entries(util as Record<string, unknown>)) {
    vi.stubGlobal(name, value)
  }
}

vi.stubGlobal('useRuntimeConfig', () => testState.config)
vi.stubGlobal('useDb', () => testState.db)
vi.stubGlobal('useClaude', () => testState.claude)

// Nitro server assets (see nitro.serverAssets in nuxt.config.ts), read from
// disk like `nuxt dev` does: `assets:cv-fonts` is packages/cv-render/fonts.
vi.stubGlobal('useStorage', (base: string) => ({
  async getItemRaw(key: string) {
    if (base !== 'assets:cv-fonts') throw new Error(`useStorage(${base}) is not stubbed`)
    return new Uint8Array(await readFile(CV_FONTS_DIR + key.replaceAll(':', '/')))
  },
}))

// nuxt-auth-utils doubles: the "session" is whatever user the test logged in.
vi.stubGlobal('getUserSession', async () =>
  testState.user ? { user: testState.user, sessionVersion: testState.sessionVersion } : {},
)
vi.stubGlobal('requireUserSession', async () => {
  if (!testState.user)
    throw h3.createError({ statusCode: 401, message: 'Connecte-toi pour continuer.' })
  return { user: testState.user, sessionVersion: testState.sessionVersion }
})
vi.stubGlobal(
  'setUserSession',
  async (_event: unknown, data: { user: typeof testState.user; sessionVersion?: number }) => {
    testState.user = data.user
    testState.sessionVersion = data.sessionVersion ?? 0
  },
)
vi.stubGlobal('clearUserSession', async () => {
  testState.user = null
})
// Fast, reversible stand-ins for scrypt: the real algorithm is nuxt-auth-utils' job.
vi.stubGlobal('hashPassword', async (password: string) => `hashed:${password}`)
vi.stubGlobal(
  'verifyPassword',
  async (hash: string, password: string) => hash === `hashed:${password}`,
)
