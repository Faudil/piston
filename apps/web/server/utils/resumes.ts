import { and, desc, eq, resumes } from '@piston/db'

/**
 * Returns the resume a generation should use: the one given by id, or the
 * user's current one. Throws a French 4xx error when there is none.
 */
export async function getResumeForGeneration(userId: string, resumeId?: string) {
  const resume = await useDb().query.resumes.findFirst({
    where: resumeId
      ? and(eq(resumes.id, resumeId), eq(resumes.userId, userId))
      : and(eq(resumes.userId, userId), eq(resumes.isCurrent, true)),
    orderBy: desc(resumes.createdAt),
  })
  if (!resume) {
    throw createError({
      statusCode: resumeId ? 404 : 400,
      message: resumeId ? 'CV introuvable.' : "Ajoute d'abord ton CV sur la page CV.",
    })
  }
  return resume
}
