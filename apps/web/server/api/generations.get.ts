import { and, count, desc, eq, generations, sql } from '@piston/db'
import { GenerationsQuery, type Generation, type Paginated } from '@piston/shared'

/** Paginated generation history of the current user, newest first. */
export default defineEventHandler(async (event): Promise<Paginated<Generation>> => {
  const user = await requireUser(event)
  const { kind, profileId, page, pageSize } = await getValidatedQuery(
    event,
    zodValidator(GenerationsQuery),
  )

  // Generations reference their resume profile inside the jsonb `input_refs`
  // column (backfilled by the migration for those made before profiles).
  const fromProfile = profileId
    ? sql`${generations.inputRefs}->>'profileId' = ${profileId}`
    : undefined

  const where = and(
    eq(generations.userId, user.id),
    kind ? eq(generations.kind, kind) : undefined,
    fromProfile,
  )

  const [rows, [totals]] = await Promise.all([
    useDb()
      .select()
      .from(generations)
      .where(where)
      .orderBy(desc(generations.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    useDb().select({ total: count() }).from(generations).where(where),
  ])

  return { items: rows.map(toGeneration), page, pageSize, total: totals?.total ?? 0 }
})
