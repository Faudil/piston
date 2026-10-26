import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { and, count, eq, gte, invites, isNull, sql, type UserRow } from '@piston/db'
import { LIMITS } from '@piston/shared'

/** Returns the logged-in user, or throws a 401. Use at the top of every protected route. */
export async function requireUser(event: H3Event) {
  const { user } = await requireUserSession(event)
  return user
}

/** Stores the user in the session cookie. Never put the password hash in there. */
export async function startSession(event: H3Event, user: UserRow) {
  await setUserSession(event, {
    user: { id: user.id, email: user.email, displayName: user.displayName },
    loggedInAt: new Date().toISOString(),
  })
}

export async function createInvite(createdBy: string | null) {
  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + LIMITS.inviteValidityDays * 24 * 60 * 60 * 1000)
  const [invite] = await useDb().insert(invites).values({ token, createdBy, expiresAt }).returning()
  return invite!
}

/**
 * Creates an invite for a logged-in user, at most LIMITS.invitesPerUserPerWeek
 * per rolling 7 days (used invites count). Accounts multiply per-user quotas,
 * so invitations are the first thing to cap. The count and the insert run
 * under an advisory lock so parallel requests cannot all pass the check.
 */
export async function createInviteWithQuota(userId: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  return useDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${INVITE_LOCK_KEY}::bigint)`)
    const [row] = await tx
      .select({ total: count() })
      .from(invites)
      .where(and(eq(invites.createdBy, userId), gte(invites.createdAt, since)))
    if ((row?.total ?? 0) >= LIMITS.invitesPerUserPerWeek) {
      throw createError({
        statusCode: 429,
        message: `Tu as déjà créé ${LIMITS.invitesPerUserPerWeek} invitations cette semaine. Réessaie plus tard.`,
      })
    }
    const token = randomBytes(24).toString('base64url')
    const expiresAt = new Date(Date.now() + LIMITS.inviteValidityDays * 24 * 60 * 60 * 1000)
    const [invite] = await tx
      .insert(invites)
      .values({ token, createdBy: userId, expiresAt })
      .returning()
    return invite!
  })
}

/** Finds an invite that has not been used and has not expired. */
export async function findValidInvite(token: string) {
  return useDb().query.invites.findFirst({
    where: and(
      eq(invites.token, token),
      isNull(invites.usedAt),
      gte(invites.expiresAt, new Date()),
    ),
  })
}
