import { createHmac } from 'node:crypto'
import type { H3Event } from 'h3'

declare module 'h3' {
  interface H3EventContext {
    /** Set by middleware/00-request-id.ts. */
    requestId?: string
    /** CSP nonce of this request, set by middleware/01-security-headers.ts. */
    cspNonce?: string
  }
}

/**
 * One JSON object per line on stdout/stderr, readable with `docker logs` and
 * parseable by any log collector. Fields are chosen so that nothing secret or
 * personal can reach the logs: no request body, no query string, no e-mail,
 * no document content, and the user is only a short keyed hash.
 */
function logEvent(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, ...fields })
  if (level === 'error') console.error(line)
  else console.log(line)
}

/** Replaces opaque tokens in a path (share and invitation links) so they never get logged. */
export function redactPath(pathname: string) {
  return pathname
    .split('/')
    .map((part) => (/^[\w-]{20,}$/.test(part) && !UUID.test(part) ? ':token' : part))
    .join('/')
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Stable pseudonym of a user id: lets you follow one user's errors without knowing who they are. */
export function hashUserId(userId: string, secret: string) {
  return createHmac('sha256', secret).update(userId).digest('hex').slice(0, 12)
}

/**
 * What can be said about an unexpected error without leaking data. Driver
 * errors can embed SQL (placeholders only, never values, but long) so only
 * the first line is kept, trimmed; the stack is reduced to its frames.
 */
export function describeError(error: unknown) {
  const e = error as { name?: string; message?: string; stack?: string; cause?: { code?: string } }
  return {
    name: e?.name ?? 'Error',
    message: String(e?.message ?? error)
      .split('\n')[0]!
      .slice(0, 200),
    code: e?.cause?.code,
    stack: e?.stack
      ?.split('\n')
      .filter((line) => line.trim().startsWith('at '))
      .slice(0, 8)
      .map((line) => line.trim()),
  }
}

/** Logs a server error with its request context. */
export async function logServerError(event: H3Event, error: unknown) {
  const status = (error as { statusCode?: number })?.statusCode ?? 500
  let userHash: string | undefined
  try {
    const { user } = await getUserSession(event)
    if (user) userHash = hashUserId(user.id, useRuntimeConfig().session.password)
  } catch {
    // An unreadable session must not hide the original error.
  }
  logEvent('error', {
    requestId: event.context.requestId,
    method: event.method,
    route: redactPath(getRequestURL(event).pathname),
    status,
    userHash,
    ...describeError(error),
  })
}
