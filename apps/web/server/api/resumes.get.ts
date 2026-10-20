import { desc, eq, resumes } from '@piston/db'

/** Lists the user's resume versions, newest first. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const rows = await useDb()
    .select()
    .from(resumes)
    .where(eq(resumes.userId, user.id))
    .orderBy(desc(resumes.createdAt))
  return rows.map(toResume)
})
