import { statfs } from 'node:fs/promises'
import { sql } from '@piston/db'

/** Below this share of free disk space the status is « degraded ». */
const MIN_FREE_DISK_RATIO = 0.05

/**
 * Used by the Docker HEALTHCHECK and by uptime monitors. Answers 503 when the
 * database is unreachable; a nearly full disk only makes the status
 * « degraded » (HTTP 200), which a monitor can match on. Public, so it only
 * reveals coarse numbers.
 */
export default defineEventHandler(async (event) => {
  const db = await useDb()
    .execute(sql`select 1`)
    .then(() => 'ok' as const)
    .catch(() => 'down' as const)

  // Disk of the container's filesystem (uploads live in the database, but a
  // full disk still stops Postgres from writing when it shares the host).
  const disk = await statfs('/')
    .then((s) => ({ freePercent: Math.round((s.bavail / s.blocks) * 100) }))
    .catch(() => null)

  const diskLow = disk !== null && disk.freePercent < MIN_FREE_DISK_RATIO * 100
  const status = db === 'down' ? 'down' : diskLow ? 'degraded' : 'ok'
  if (db === 'down') setResponseStatus(event, 503)
  return { status, db, disk }
})
