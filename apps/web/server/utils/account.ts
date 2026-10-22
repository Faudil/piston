import {
  applications,
  eq,
  generations,
  jobOffers,
  resumeProfiles,
  resumes,
  users,
  type UserRow,
} from '@piston/db'

/** Loads the full user row (with password hash) for the session's user, or throws a 401. */
export async function getAccountUser(userId: string): Promise<UserRow> {
  const user = await useDb().query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) throw createError({ statusCode: 401, message: 'Connecte-toi pour continuer.' })
  return user
}

/**
 * Everything the app stores about a user, as a JSON-serializable object
 * (GDPR-style export). Deliberately left out: the password hash, and the
 * resumes' PDF bytes (the extracted text is included, the file stays
 * downloadable one by one from the CV page).
 */
export async function buildAccountExport(userId: string) {
  const db = useDb()
  const user = await getAccountUser(userId)
  const [profileRows, resumeRows, offerRows, generationRows, applicationRows] = await Promise.all([
    db.select().from(resumeProfiles).where(eq(resumeProfiles.userId, userId)),
    db.select(resumeColumns).from(resumes).where(eq(resumes.userId, userId)),
    db.select().from(jobOffers).where(eq(jobOffers.userId, userId)),
    db.select().from(generations).where(eq(generations.userId, userId)),
    db.select().from(applications).where(eq(applications.userId, userId)),
  ])

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
    },
    resumeProfiles: profileRows.map(({ userId: _userId, ...row }) => row),
    resumes: resumeRows.map(({ userId: _userId, ...row }) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    offers: offerRows.map(({ userId: _userId, ...row }) => row),
    generations: generationRows.map(({ userId: _userId, ...row }) => row),
    applications: applicationRows.map(({ userId: _userId, ...row }) => row),
  }
}
