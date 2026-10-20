import { runMigrations } from '@piston/db/migrate'
import { and, count, gte, invites, isNull, users } from '@piston/db'

/**
 * Applies pending database migrations when the production server starts, then
 * makes sure a fresh install has a way to create its first account.
 * Skipped in development, where `bun db:migrate` is run by hand.
 *
 * `import.meta.url` is meaningless once Nitro has bundled the server, so the
 * folder containing the SQL files is given explicitly by MIGRATIONS_DIR (the
 * Dockerfile copies it to /app/drizzle).
 */
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.dev) return

  const { databaseUrl } = useRuntimeConfig()
  const folder = process.env.MIGRATIONS_DIR || '/app/drizzle'

  const ready = (async () => {
    await runMigrations(databaseUrl, folder)
    console.info(`[migrate] database is up to date (${folder})`)
    await logFirstInvite()
  })().catch((error) => {
    // Crash on purpose: the container restarts and retries, instead of
    // serving requests against a missing or outdated schema.
    console.error('[migrate] startup failed, exiting', error)
    process.exit(1)
  })

  // Nitro does not wait for async plugins before it starts accepting
  // connections, so hold every incoming request until this is done.
  nitroApp.hooks.hook('request', () => ready)
})

/**
 * With no account at all, nobody can sign up (invitation-only). Log an invite
 * link, reusing a still-valid CLI invite (createdBy = null) across restarts.
 */
async function logFirstInvite() {
  const db = useDb()
  const [row] = await db.select({ total: count() }).from(users)
  if ((row?.total ?? 0) > 0) return

  const existing = await db.query.invites.findFirst({
    where: and(
      isNull(invites.createdBy),
      isNull(invites.usedAt),
      gte(invites.expiresAt, new Date()),
    ),
  })
  const invite = existing ?? (await createInvite(null))
  console.info(
    `[piston] No account yet. Create the first one with this invitation link (valid 7 days): /invite/${invite.token}  (prefix it with your public URL)`,
  )
}
