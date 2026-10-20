import { and, eq, resumes } from '@piston/db'
import { IdParam, UpdateResumeBody } from '@piston/shared'

/** Renames a resume version. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const { title } = await readValidatedBody(event, zodValidator(UpdateResumeBody))
  const updated = await useDb()
    .update(resumes)
    .set({ title })
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.id)))
    .returning({ id: resumes.id })
  if (updated.length === 0) throw createError({ statusCode: 404, message: 'CV introuvable.' })
  return toResume(await getUserResume(user.id, id))
})
