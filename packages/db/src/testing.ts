import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { Database } from './client'
import { migrationsFolder } from './migrate'
import * as schema from './schema'

/**
 * Creates a throwaway in-memory PostgreSQL (PGlite, Postgres compiled to WASM)
 * with every migration applied. Used by the test suites so they run against
 * real SQL without needing a database server.
 */
export async function createTestDb(): Promise<Database> {
  const client = new PGlite()
  const db = drizzle(client, { schema, casing: 'snake_case' })
  await migrate(db, { migrationsFolder })
  // Both drivers expose the same query builder; only the underlying client differs.
  return db as unknown as Database
}

/** Empties every table, much faster than creating a new database for each test. */
export async function truncateAll(db: Database) {
  await db.execute(
    sql`truncate table applications, generations, job_offers, resumes, resume_profiles, invites, users restart identity cascade`,
  )
}
