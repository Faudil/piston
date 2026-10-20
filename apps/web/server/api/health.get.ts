import { sql } from '@piston/db'

/** Used by the Docker HEALTHCHECK. Fails if the database is unreachable. */
export default defineEventHandler(async () => {
  await useDb().execute(sql`select 1`)
  return { status: 'ok' }
})
