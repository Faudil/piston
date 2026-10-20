import { and, desc, eq, generations, sql } from '@piston/db'
import type { Generation, GenerationKind } from '@piston/shared'
import { IdParam } from '@piston/shared'

/**
 * The latest analysis and the latest cover letter of an offer, so the offer
 * page shows previous results when it is reopened.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  await getUserOffer(user.id, id)

  const latest = async <K extends GenerationKind>(kind: K) => {
    const row = await useDb().query.generations.findFirst({
      where: and(
        eq(generations.userId, user.id),
        eq(generations.kind, kind),
        // Generations reference their offer inside the jsonb `input_refs` column.
        sql`${generations.inputRefs}->>'offerId' = ${id}`,
      ),
      orderBy: desc(generations.createdAt),
    })
    return row ? (toGeneration(row) as Generation<K>) : null
  }

  const [analysis, coverLetter] = await Promise.all([
    latest('offer_analysis'),
    latest('cover_letter'),
  ])
  return { analysis, coverLetter }
})
