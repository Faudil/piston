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

/**
 * Saves a new resume version and makes it the current one: after pasting or
 * importing a new version, that is the one users expect the features to use.
 * Older versions are kept so they can be switched back to.
 */
export async function createCurrentResume(
  userId: string,
  input: { title: string; rawText: string; sourceFilename?: string | null },
) {
  // A partial unique index allows a single current resume per user, so the
  // previous one must be unset before the new one is inserted, atomically.
  return useDb().transaction(async (tx) => {
    await tx
      .update(resumes)
      .set({ isCurrent: false })
      .where(and(eq(resumes.userId, userId), eq(resumes.isCurrent, true)))
    const [row] = await tx
      .insert(resumes)
      .values({ userId, ...input, isCurrent: true })
      .returning()
    return row!
  })
}

/** Makes an existing version the current one. Throws a 404 if it is not the user's. */
export async function setCurrentResume(userId: string, resumeId: string) {
  return useDb().transaction(async (tx) => {
    const target = await tx.query.resumes.findFirst({
      where: and(eq(resumes.id, resumeId), eq(resumes.userId, userId)),
    })
    if (!target) throw createError({ statusCode: 404, message: 'CV introuvable.' })

    await tx
      .update(resumes)
      .set({ isCurrent: false })
      .where(and(eq(resumes.userId, userId), eq(resumes.isCurrent, true)))
    const [row] = await tx
      .update(resumes)
      .set({ isCurrent: true })
      .where(eq(resumes.id, target.id))
      .returning()
    return row!
  })
}
