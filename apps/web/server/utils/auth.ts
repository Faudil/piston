import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { and, eq, gte, invites, isNull, type UserRow } from '@piston/db'
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
