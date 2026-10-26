import type { H3Event } from 'h3'
import { and, authAttempts, count, eq, gte, lt } from '@piston/db'

/** Sliding window shared by every rule below. */
const WINDOW_MS = 15 * 60 * 1000

/** What is counted, and how many events one key may produce per window. */
export const THROTTLE = {
  /** Failed logins for one e-mail address, whoever they come from. */
  loginEmail: { name: 'login-email', limit: 10 },
  /** Failed logins from one IP address, whatever the e-mail. */
  loginIp: { name: 'login-ip', limit: 30 },
  /** Failed sign-ups (unusable invitation link) from one IP address. */
  registerIp: { name: 'register-ip', limit: 10 },
  /** Invitation link checks from one IP address (every call counts: a guessing oracle). */
  inviteCheckIp: { name: 'invite-check-ip', limit: 60 },
} as const

export type ThrottleRule = (typeof THROTTLE)[keyof typeof THROTTLE]

/**
 * The client's IP address. Behind a reverse proxy the socket address is the
 * proxy's, so with TRUST_PROXY=true the address is read from X-Forwarded-For.
 * The LAST entry is the one our own proxy appended; earlier entries are
 * written by the client and can be anything. This assumes exactly one trusted
 * proxy hop (nginx-proxy). Never enable TRUST_PROXY when the app is reachable
 * without that proxy: anyone could then pick their own IP.
 */
export function clientIp(event: H3Event): string {
  if (useRuntimeConfig().trustProxy) {
    const forwarded = getRequestHeader(event, 'x-forwarded-for')?.split(',').pop()?.trim()
    if (forwarded) return forwarded
  }
  return getRequestIP(event) ?? 'unknown'
}

/** Key of one counter: rule name and what is counted (an IP, an e-mail). */
export function throttleBucket(rule: ThrottleRule, key: string) {
  return `${rule.name}:${key}`
}

/** Throws a French 429 when `key` already used up the rule's allowance in the window. */
export async function assertNotThrottled(rule: ThrottleRule, key: string) {
  const since = new Date(Date.now() - WINDOW_MS)
  const [row] = await useDb()
    .select({ total: count() })
    .from(authAttempts)
    .where(
      and(eq(authAttempts.bucket, throttleBucket(rule, key)), gte(authAttempts.createdAt, since)),
    )
  if ((row?.total ?? 0) >= rule.limit) {
    throw createError({
      statusCode: 429,
      message: 'Trop de tentatives, réessaie dans quelques minutes.',
    })
  }
}

/** Counts one event against the rule. */
export async function recordAttempt(rule: ThrottleRule, key: string) {
  const db = useDb()
  await db.insert(authAttempts).values({ bucket: throttleBucket(rule, key) })
  // Housekeeping: one call in fifty also deletes events older than a day.
  if (Math.random() < 0.02) {
    await db.delete(authAttempts).where(lt(authAttempts.createdAt, new Date(Date.now() - 864e5)))
  }
}

/** Forgets the events of a key (a successful login resets that e-mail's counter). */
export async function clearAttempts(rule: ThrottleRule, key: string) {
  await useDb()
    .delete(authAttempts)
    .where(eq(authAttempts.bucket, throttleBucket(rule, key)))
}

/**
 * Counts one invitation link check from this client, or throws a 429.
 * Called for the API route and for the /invite/ page, which checks the link
 * itself during server rendering through an internal request whose client
 * address is unknown: such internal calls are skipped, the page request that
 * triggered them was already counted.
 */
export async function throttleInviteCheck(event: H3Event) {
  const ip = clientIp(event)
  if (ip === 'unknown') return
  await assertNotThrottled(THROTTLE.inviteCheckIp, ip)
  await recordAttempt(THROTTLE.inviteCheckIp, ip)
}
