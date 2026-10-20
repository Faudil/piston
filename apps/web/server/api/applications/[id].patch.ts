import { and, applications, eq } from '@piston/db'
import { IdParam, UpdateApplicationBody } from '@piston/shared'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const patch = await readValidatedBody(event, zodValidator(UpdateApplicationBody))

  const { application, offer } = await getApplicationForUser(user.id, id)
  const next = applyStatusChange(application, patch, new Date())

  const [row] = await useDb()
    .update(applications)
    .set(next)
    .where(and(eq(applications.id, id), eq(applications.userId, user.id)))
    .returning()
  return toApplication(row!, offer)
})
