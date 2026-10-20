/**
 * Seeds a development database with one demo user and a sample resume.
 * Idempotent: running it twice does not create duplicates.
 *
 *   bun run db:seed
 */
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import { eq } from 'drizzle-orm'
import { createDb } from './client'
import { sampleResume } from './fixtures/sample-resume'
import { resumes, users } from './schema'

const DEMO_EMAIL = 'demo@example.com'
const DEMO_PASSWORD = 'demo-password'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.')
  process.exit(1)
}

const db = createDb(url, { max: 1 })

const existing = await db.query.users.findFirst({ where: eq(users.email, DEMO_EMAIL) })
if (existing) {
  console.log(`Demo user already exists: ${DEMO_EMAIL}`)
} else {
  // Same algorithm and format as nuxt-auth-utils' hashPassword(), so the app can verify it.
  const passwordHash = await new Hash(new Scrypt({})).make(DEMO_PASSWORD)
  const [user] = await db
    .insert(users)
    .values({ email: DEMO_EMAIL, displayName: 'Camille (démo)', passwordHash })
    .returning()

  await db.insert(resumes).values({
    userId: user!.id,
    title: 'CV communication 2026',
    rawText: sampleResume,
    isCurrent: true,
  })
  console.log(`Created demo user ${DEMO_EMAIL} / ${DEMO_PASSWORD} with a sample resume.`)
}

await db.$client.end()
