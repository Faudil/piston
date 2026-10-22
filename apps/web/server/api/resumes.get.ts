import { and, desc, eq, resumes } from '@piston/db'
import { ResumesQuery } from '@piston/shared'

/** Lists the user's resume versions, newest first, optionally those of one profile only. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { profileId } = await getValidatedQuery(event, zodValidator(ResumesQuery))
  const rows = await useDb()
    .select(resumeColumns)
    .from(resumes)
    .where(
      and(eq(resumes.userId, user.id), profileId ? eq(resumes.profileId, profileId) : undefined),
    )
    .orderBy(desc(resumes.createdAt))
  return rows.map(toResume)
})
