import { and, count, eq, generations, gte } from '@piston/db'

/**
 * Caps Claude usage at N generations per user over the last 24 hours
 * (N = runtimeConfig.dailyGenerationLimit, 30 by default). Counting rows in
 * `generations` keeps the limit exact across restarts without extra storage.
 */
export default defineEventHandler(async (event) => {
  if (event.method !== 'POST' || !getRequestURL(event).pathname.startsWith('/api/generate/')) return

  const { user } = await requireUserSession(event)
  const { dailyGenerationLimit } = useRuntimeConfig(event)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [row] = await useDb()
    .select({ total: count() })
    .from(generations)
    .where(and(eq(generations.userId, user.id), gte(generations.createdAt, since)))

  if ((row?.total ?? 0) >= dailyGenerationLimit) {
    throw createError({
      statusCode: 429,
      message: `Tu as atteint la limite de ${dailyGenerationLimit} générations sur 24 heures. Reviens demain !`,
    })
  }
})
