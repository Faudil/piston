/**
 * Creates an invitation link from the command line. This is how the very first
 * account is created on a fresh install, since there is no public sign-up.
 *
 *   bun run db:invite                 # uses http://localhost:3000
 *   bun run db:invite https://my.host
 */
import { randomBytes } from 'node:crypto'
import { LIMITS } from '@piston/shared'
import { createDb } from './client'
import { invites } from './schema'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const baseUrl = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '')
const db = createDb(url, { max: 1 })

const token = randomBytes(24).toString('base64url')
const expiresAt = new Date(Date.now() + LIMITS.inviteValidityDays * 24 * 60 * 60 * 1000)
await db.insert(invites).values({ token, expiresAt })

console.log(`Invitation link (valid ${LIMITS.inviteValidityDays} days):`)
console.log(`${baseUrl}/invite/${token}`)

await db.$client.end()
