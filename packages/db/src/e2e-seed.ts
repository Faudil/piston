/**
 * Prepares the database of the end-to-end tests (`bun run e2e`, see e2e/):
 * creates it if needed, resets it, applies the migrations and inserts one
 * user with a default profile and a resume.
 *
 *   DATABASE_URL=postgres://piston:piston@localhost:5432/piston_e2e bun packages/db/src/e2e-seed.ts
 *
 * DESTRUCTIVE by design (the schema is dropped on every run), so it refuses
 * any database whose name does not end with `_e2e`: the development database
 * can never be wiped by mistake.
 */
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import postgres from 'postgres'
import { createDb } from './client'
import { sampleResume } from './fixtures/sample-resume'
import { runMigrations } from './migrate'
import { onboardingHints } from '@piston/shared'
import { resumeProfiles, resumes, users } from './schema'

const E2E_EMAIL = 'e2e@example.com'
const E2E_PASSWORD = 'e2e-password'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}
const databaseName = decodeURIComponent(new URL(url).pathname.slice(1))
if (!databaseName.endsWith('_e2e')) {
  console.error(`Refusing to reset "${databaseName}": the e2e database name must end with _e2e.`)
  process.exit(1)
}

// 1. Create the database when missing (locally, on the development server).
const adminUrl = new URL(url)
adminUrl.pathname = '/postgres'
const admin = postgres(adminUrl.href, { max: 1, onnotice: () => {} })
const [exists] = await admin`select 1 from pg_database where datname = ${databaseName}`
if (!exists) await admin.unsafe(`create database "${databaseName}"`)
await admin.end()

// 2. Reset it (also drops Drizzle's bookkeeping, so the migrations run again).
const reset = postgres(url, { max: 1, onnotice: () => {} })
await reset.unsafe('drop schema if exists public cascade; drop schema if exists drizzle cascade;')
await reset.unsafe('create schema public')
await reset.end()

await runMigrations(url)

// 3. Seed.
const db = createDb(url, { max: 1 })
// Same algorithm and format as nuxt-auth-utils' hashPassword().
const passwordHash = await new Hash(new Scrypt({})).make(E2E_PASSWORD)
const [user] = await db
  .insert(users)
  // The welcome dialog and page tips are closed: the tests drive the features
  // themselves (e2e/tests/onboarding.spec.ts reopens them on purpose).
  .values({
    email: E2E_EMAIL,
    displayName: 'Camille (e2e)',
    passwordHash,
    dismissedHints: [...onboardingHints],
  })
  .returning()
const [profile] = await db
  .insert(resumeProfiles)
  .values({ userId: user!.id, name: 'Principal', isDefault: true })
  .returning()
await db.insert(resumes).values({
  userId: user!.id,
  profileId: profile!.id,
  title: 'CV communication 2026',
  rawText: sampleResume,
  isCurrent: true,
})
await db.$client.end()
console.log(`E2E database "${databaseName}" ready (${E2E_EMAIL} / ${E2E_PASSWORD}).`)
