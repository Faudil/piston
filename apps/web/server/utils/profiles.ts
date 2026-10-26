import {
  and,
  asc,
  eq,
  resumeProfiles,
  resumes,
  type Database,
  type ResumeProfileRow,
} from '@piston/db'
import type { ResumeProfile } from '@piston/shared'

/** A transaction handle, or the database itself: both run the same queries. */
type DbExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

/** Name of the profile created for users who add a resume without having any profile. */
const DEFAULT_PROFILE_NAME = 'Principal'

function profileNotFound() {
  return createError({ statusCode: 404, message: 'Profil de CV introuvable.' })
}

/** True for a PostgreSQL unique violation, whether drizzle wrapped the driver error or not. */
function isUniqueViolation(error: unknown): boolean {
  const codeOf = (value: unknown) =>
    typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined
  const cause = typeof error === 'object' && error !== null ? (error as Error).cause : undefined
  return codeOf(error) === '23505' || codeOf(cause) === '23505'
}

function duplicateName() {
  return createError({ statusCode: 409, message: 'Tu as déjà un profil de CV avec ce nom.' })
}

/** Returns one of the user's profiles, or throws a 404 (also for other users' profiles). */
export async function getUserProfile(
  userId: string,
  profileId: string,
  db: DbExecutor = useDb(),
): Promise<ResumeProfileRow> {
  const [profile] = await db
    .select()
    .from(resumeProfiles)
    .where(and(eq(resumeProfiles.id, profileId), eq(resumeProfiles.userId, userId)))
  if (!profile) throw profileNotFound()
  return profile
}

/** The user's default profile, or undefined when the user has no profile yet. */
export async function findDefaultProfile(userId: string, db: DbExecutor = useDb()) {
  const [profile] = await db
    .select()
    .from(resumeProfiles)
    .where(and(eq(resumeProfiles.userId, userId), eq(resumeProfiles.isDefault, true)))
  return profile
}

/**
 * The profile a new resume version goes to: the given one (checked to be the
 * user's), else the default one, created as « Principal » for a user who has
 * no profile yet (new users get their first profile with their first resume).
 */
export async function resolveProfileForNewResume(
  db: DbExecutor,
  userId: string,
  profileId?: string,
): Promise<ResumeProfileRow> {
  if (profileId) return getUserProfile(userId, profileId, db)
  const existing = await findDefaultProfile(userId, db)
  if (existing) return existing
  const [created] = await db
    .insert(resumeProfiles)
    .values({ userId, name: DEFAULT_PROFILE_NAME, isDefault: true })
    .returning()
  return created!
}

/** Every profile of the user, oldest first, with its current version and its number of versions. */
export async function listProfiles(userId: string): Promise<ResumeProfile[]> {
  const db = useDb()
  const [profiles, versions] = await Promise.all([
    db
      .select()
      .from(resumeProfiles)
      .where(eq(resumeProfiles.userId, userId))
      .orderBy(asc(resumeProfiles.createdAt)),
    db
      .select({
        id: resumes.id,
        profileId: resumes.profileId,
        title: resumes.title,
        isCurrent: resumes.isCurrent,
        updatedAt: resumes.updatedAt,
      })
      .from(resumes)
      .where(eq(resumes.userId, userId)),
  ])

  return profiles.map((profile) => {
    const own = versions.filter((version) => version.profileId === profile.id)
    const current = own.find((version) => version.isCurrent)
    return {
      id: profile.id,
      name: profile.name,
      isDefault: profile.isDefault,
      current: current
        ? { id: current.id, title: current.title, updatedAt: current.updatedAt.toISOString() }
        : null,
      versionsCount: own.length,
      createdAt: profile.createdAt.toISOString(),
    }
  })
}

/** Creates a profile. The user's first profile becomes the default one. */
export async function createProfile(userId: string, name: string) {
  try {
    return await useDb().transaction(async (tx) => {
      const hasDefault = Boolean(await findDefaultProfile(userId, tx))
      const [row] = await tx
        .insert(resumeProfiles)
        .values({ userId, name, isDefault: !hasDefault })
        .returning()
      return row!
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateName()
    throw error
  }
}

/**
 * Renames a profile and/or makes it the default one. The previous default is
 * unset in the same transaction (the database allows one default per user).
 */
export async function updateProfile(
  userId: string,
  profileId: string,
  changes: { name?: string; isDefault?: true },
) {
  try {
    await useDb().transaction(async (tx) => {
      const profile = await getUserProfile(userId, profileId, tx)
      if (changes.isDefault && !profile.isDefault) {
        await tx
          .update(resumeProfiles)
          .set({ isDefault: false })
          .where(and(eq(resumeProfiles.userId, userId), eq(resumeProfiles.isDefault, true)))
      }
      await tx
        .update(resumeProfiles)
        .set({
          ...(changes.name !== undefined && { name: changes.name }),
          ...(changes.isDefault && { isDefault: true }),
        })
        .where(eq(resumeProfiles.id, profile.id))
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateName()
    throw error
  }
}

/**
 * Deletes a profile and, by cascade, its versions. Offers using it fall back
 * to the default profile (their `profile_id` is set to null by the database).
 * If it was the default, the oldest remaining profile takes over. Deleting
 * the last profile is allowed: the user is then back to having no resume.
 */
export async function deleteProfile(userId: string, profileId: string) {
  await useDb().transaction(async (tx) => {
    const [deleted] = await tx
      .delete(resumeProfiles)
      .where(and(eq(resumeProfiles.id, profileId), eq(resumeProfiles.userId, userId)))
      .returning({ isDefault: resumeProfiles.isDefault })
    if (!deleted) throw profileNotFound()
    if (!deleted.isDefault) return

    const [oldest] = await tx
      .select({ id: resumeProfiles.id })
      .from(resumeProfiles)
      .where(eq(resumeProfiles.userId, userId))
      .orderBy(asc(resumeProfiles.createdAt), asc(resumeProfiles.id))
      .limit(1)
    if (oldest) {
      await tx
        .update(resumeProfiles)
        .set({ isDefault: true })
        .where(eq(resumeProfiles.id, oldest.id))
    }
  })
}
