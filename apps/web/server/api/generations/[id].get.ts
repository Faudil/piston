import { and, eq, generations } from '@piston/db'
import { IdParam } from '@piston/shared'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))

  const row = await useDb().query.generations.findFirst({
    where: and(eq(generations.id, id), eq(generations.userId, user.id)),
  })
  if (!row) throw createError({ statusCode: 404, message: 'Génération introuvable.' })
  return toGeneration(row)
})
