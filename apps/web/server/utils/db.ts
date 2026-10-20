import { createDb, type Database } from '@piston/db'

let db: Database | undefined

/**
 * Returns the app-wide Drizzle client, created on first use.
 * Auto-imported in every server file, like all helpers in server/utils.
 */
export function useDb(): Database {
  if (!db) {
    const { databaseUrl } = useRuntimeConfig()
    if (!databaseUrl) throw new Error('DATABASE_URL is not configured')
    db = createDb(databaseUrl)
  }
  return db
}
