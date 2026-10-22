import { and, count, desc, eq, resumes, sql } from '@piston/db'

/**
 * Columns to select for every resume query that is not the PDF download: all
 * of them except the PDF bytes (up to 5 MB per row), replaced by a boolean.
 */
export const resumeColumns = {
  id: resumes.id,
  createdAt: resumes.createdAt,
  updatedAt: resumes.updatedAt,
  userId: resumes.userId,
  profileId: resumes.profileId,
  title: resumes.title,
  rawText: resumes.rawText,
  sourceFilename: resumes.sourceFilename,
  isCurrent: resumes.isCurrent,
  hasPdf: sql<boolean>`${resumes.sourcePdf} is not null`.as('has_pdf'),
}

/** Returns one of the user's resumes without its PDF bytes, or throws a 404. */
export async function getUserResume(userId: string, resumeId: string) {
  const [row] = await useDb()
    .select(resumeColumns)
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
  if (!row) throw createError({ statusCode: 404, message: 'CV introuvable.' })
  return row
}

/**
 * Returns the resume a generation should use, in this order: the version
 * `resumeId`; else the current version of `profileId`; else the current
 * version of the default profile. Throws a French 4xx error when there is none.
 */
export async function getResumeForGeneration(
  userId: string,
  opts: { resumeId?: string; profileId?: string } = {},
) {
  const db = useDb()
  if (opts.resumeId) {
    const resume = await db.query.resumes.findFirst({
      columns: { sourcePdf: false },
      where: and(eq(resumes.id, opts.resumeId), eq(resumes.userId, userId)),
    })
    if (!resume) throw createError({ statusCode: 404, message: 'CV introuvable.' })
    return resume
  }

  const profile = opts.profileId
    ? await getUserProfile(userId, opts.profileId)
    : await findDefaultProfile(userId)
  const resume = profile
    ? await db.query.resumes.findFirst({
        columns: { sourcePdf: false },
        where: and(eq(resumes.profileId, profile.id), eq(resumes.isCurrent, true)),
      })
    : undefined
  if (resume) return resume

  // Distinguish "no resume at all" from "this profile has no version yet".
  const [versions] = await db
    .select({ total: count() })
    .from(resumes)
    .where(eq(resumes.userId, userId))
  throw createError({
    statusCode: 400,
    message: versions?.total
      ? "Ce profil de CV n'a pas encore de version."
      : "Ajoute d'abord ton CV sur la page CV.",
  })
}

/**
 * Saves a new resume version in a profile (the default one if none is given,
 * created as « Principal » for a user without profiles) and makes it the
 * profile's current version: after pasting or importing a new version, that
 * is the one users expect the features to use. Older versions are kept so
 * they can be switched back to. Throws a 404 for another user's profile.
 */
export async function createCurrentResume(
  userId: string,
  input: {
    title: string
    rawText: string
    profileId?: string
    sourceFilename?: string | null
    sourcePdf?: Uint8Array | null
  },
) {
  const { profileId, ...values } = input
  // A partial unique index allows a single current resume per profile, so the
  // previous one must be unset before the new one is inserted, atomically.
  return useDb().transaction(async (tx) => {
    const profile = await resolveProfileForNewResume(tx, userId, profileId)
    await tx
      .update(resumes)
      .set({ isCurrent: false })
      .where(and(eq(resumes.profileId, profile.id), eq(resumes.isCurrent, true)))
    const [row] = await tx
      .insert(resumes)
      .values({ userId, profileId: profile.id, ...values, isCurrent: true })
      .returning(resumeColumns)
    return row!
  })
}

/**
 * Makes an existing version the current one of its profile. Throws a 404 if
 * it is not the user's.
 */
export async function setCurrentResume(userId: string, resumeId: string) {
  return useDb().transaction(async (tx) => {
    const target = await tx.query.resumes.findFirst({
      columns: { id: true, profileId: true },
      where: and(eq(resumes.id, resumeId), eq(resumes.userId, userId)),
    })
    if (!target) throw createError({ statusCode: 404, message: 'CV introuvable.' })

    await tx
      .update(resumes)
      .set({ isCurrent: false })
      .where(and(eq(resumes.profileId, target.profileId), eq(resumes.isCurrent, true)))
    const [row] = await tx
      .update(resumes)
      .set({ isCurrent: true })
      .where(eq(resumes.id, target.id))
      .returning(resumeColumns)
    return row!
  })
}

/**
 * Deletes a resume version. If it was the current one of its profile, the
 * most recent remaining version of that profile becomes current, so a profile
 * is never left with versions but no current one. Throws a 404 if it is not
 * the user's.
 */
export async function deleteResume(userId: string, resumeId: string) {
  await useDb().transaction(async (tx) => {
    const [target] = await tx
      .delete(resumes)
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
      .returning({ id: resumes.id, isCurrent: resumes.isCurrent, profileId: resumes.profileId })
    if (!target) throw createError({ statusCode: 404, message: 'CV introuvable.' })
    if (!target.isCurrent) return

    // The current one is gone, so the unique "one current" index is free.
    const [latest] = await tx
      .select({ id: resumes.id })
      .from(resumes)
      .where(eq(resumes.profileId, target.profileId))
      .orderBy(desc(resumes.createdAt))
      .limit(1)
    if (latest) await tx.update(resumes).set({ isCurrent: true }).where(eq(resumes.id, latest.id))
  })
}

/** The file name and bytes served by the download route. */
export function resumeDownload(row: {
  title: string
  rawText: string
  sourceFilename: string | null
  sourcePdf: Uint8Array | null
}) {
  if (row.sourcePdf) {
    return {
      body: row.sourcePdf,
      type: 'application/pdf',
      filename: row.sourceFilename || `${row.title}.pdf`,
    }
  }
  // Pasted resumes have no file: offer the text itself.
  return { body: row.rawText, type: 'text/plain; charset=utf-8', filename: `${row.title}.txt` }
}

/**
 * Value of a `content-disposition: attachment` header that is safe for any
 * user-provided name: an ASCII-only `filename` fallback (no quotes, slashes or
 * control characters) plus the real UTF-8 name in `filename*` (RFC 5987).
 */
export function attachmentHeader(filename: string) {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is stripped
  const clean = filename.replace(/[\u0000-\u001f\u007f/\\]/g, '_')
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_').replace(/["%;]/g, '_')
  const encoded = encodeURIComponent(clean).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}
