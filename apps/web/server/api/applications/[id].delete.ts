import { and, applications, eq } from '@piston/db'
import { IdParam } from '@piston/shared'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const deleted = await useDb()
    .delete(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, user.id)))
    .returning({ id: applications.id })
  if (!deleted.length) throw createError({ statusCode: 404, message: 'Candidature introuvable.' })
  setResponseStatus(event, 204)
  return null
})
