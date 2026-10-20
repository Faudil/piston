import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Database = ReturnType<typeof createDb>

/**
 * Creates a Drizzle client backed by the `postgres` driver.
 * The app keeps a single instance for its whole lifetime (see apps/web/server/utils/db.ts).
 */
export function createDb(url: string, options: { max?: number } = {}) {
  const sql = postgres(url, { max: options.max ?? 10 })
  return drizzle(sql, { schema, casing: 'snake_case' })
}
