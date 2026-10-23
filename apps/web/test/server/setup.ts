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
import { fileURLToPath } from 'node:url'
import * as h3 from 'h3'
import { vi } from 'vitest'
import * as account from '../../server/utils/account'
import * as applications from '../../server/utils/applications'
import * as auth from '../../server/utils/auth'
import * as claude from '../../server/utils/claude'
import * as coverLetter from '../../server/utils/cover-letter'
import * as cvAi from '../../server/utils/cv-ai'
import * as cvDocuments from '../../server/utils/cv-documents'
import * as cvPdf from '../../server/utils/cv-pdf'
import * as generation from '../../server/utils/generation'
import * as offers from '../../server/utils/offers'
import * as pdf from '../../server/utils/pdf'
import * as profiles from '../../server/utils/profiles'
import * as importOffer from '../../server/utils/import-offer'
import * as tavily from '../../server/utils/tavily'
import * as webLimit from '../../server/utils/web-limit'
import * as resumes from '../../server/utils/resumes'
import * as serialize from '../../server/utils/serialize'
import * as validation from '../../server/utils/validation'
import { testState } from './state'

for (const [name, value] of Object.entries(h3)) vi.stubGlobal(name, value)

for (const util of [
  validation,
  account,
  applications,
  auth,
  claude,
  coverLetter,
  cvAi,
  cvDocuments,
  cvPdf,
  generation,
  offers,
  pdf,
  profiles,
  resumes,
  serialize,
  importOffer,
  tavily,
  webLimit,
]) {
  for (const [name, value] of Object.entries(util)) vi.stubGlobal(name, value)
}

vi.stubGlobal('useRuntimeConfig', () => testState.config)
vi.stubGlobal('useDb', () => testState.db)
vi.stubGlobal('useClaude', () => testState.claude)

// Nitro server assets (server/assets), read from disk like `nuxt dev` does.
const serverAssets = fileURLToPath(new URL('../../server/assets/', import.meta.url))
vi.stubGlobal('useStorage', (base: string) => ({
  async getItemRaw(key: string) {
    if (base !== 'assets:server') throw new Error(`useStorage(${base}) is not stubbed`)
    return new Uint8Array(await readFile(serverAssets + key.replaceAll(':', '/')))
  },
}))

// nuxt-auth-utils doubles: the "session" is whatever user the test logged in.
vi.stubGlobal('getUserSession', async () => (testState.user ? { user: testState.user } : {}))
vi.stubGlobal('requireUserSession', async () => {
  if (!testState.user)
    throw h3.createError({ statusCode: 401, message: 'Connecte-toi pour continuer.' })
  return { user: testState.user }
})
vi.stubGlobal('setUserSession', async (_event: unknown, data: { user: typeof testState.user }) => {
  testState.user = data.user
})
vi.stubGlobal('clearUserSession', async () => {
  testState.user = null
})
// Fast, reversible stand-ins for scrypt: the real algorithm is nuxt-auth-utils' job.
vi.stubGlobal('hashPassword', async (password: string) => `hashed:${password}`)
vi.stubGlobal(
  'verifyPassword',
  async (hash: string, password: string) => hash === `hashed:${password}`,
)
