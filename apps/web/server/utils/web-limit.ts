/** Maximum Tavily calls (searches and page imports) per user over a rolling 24 hours. */
const WEB_CALLS_PER_DAY = 50
const WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Timestamps of each user's recent Tavily calls, in memory.
 *
 * The counters reset when the server restarts. That is acceptable here: the
 * limit only protects the owner's Tavily credits from a runaway client, the app
 * is self-hosted for about ten people and runs as a single process, and a
 * database table would be more machinery than this guard deserves.
 */
const callsByUser = new Map<string, number[]>()

/** Records one Tavily call for the user, or throws a 429 once they used up their quota. */
export function consumeWebCall(userId: string, now = Date.now()) {
  const recent = (callsByUser.get(userId) ?? []).filter((time) => now - time < WINDOW_MS)
  if (recent.length >= WEB_CALLS_PER_DAY) {
    callsByUser.set(userId, recent)
    throw createError({
      statusCode: 429,
      message: `Tu as atteint la limite de ${WEB_CALLS_PER_DAY} recherches web sur 24 heures. Reviens demain !`,
    })
  }
  recent.push(now)
  callsByUser.set(userId, recent)
}

/** Forgets every counter. Used by tests. */
export function resetWebCalls() {
  callsByUser.clear()
}
