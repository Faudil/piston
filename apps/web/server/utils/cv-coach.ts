import { and, desc, eq, generations, resumes, sql } from '@piston/db'
import type { CvCoachReview, ResumeReviewOutput } from '@piston/shared'

const average = (values: number[]) =>
  values.length
    ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
    : 0

/**
 * The latest resume review of the document's profile, trimmed for the coach
 * panel, with whether it still describes the document: the reviewed version
 * may not be the current one any more, and the document may have been edited
 * since that version was saved. Null when the profile has no review.
 *
 * Reviews are about resume versions (text), and a document is linked to its
 * versions only through its profile (« Enregistrer comme version »).
 */
export async function getCvCoachReview(
  userId: string,
  document: { profileId: string; updatedAt: Date },
): Promise<CvCoachReview | null> {
  const [row] = await useDb()
    .select()
    .from(generations)
    .where(
      and(
        eq(generations.userId, userId),
        eq(generations.kind, 'resume_review'),
        sql`${generations.inputRefs}->>'profileId' = ${document.profileId}`,
      ),
    )
    .orderBy(desc(generations.createdAt))
    .limit(1)
  if (!row) return null

  const output = row.output as Partial<ResumeReviewOutput>
  const resumeId = row.inputRefs.resumeId
  const [resume] = resumeId
    ? await useDb()
        .select({
          id: resumes.id,
          title: resumes.title,
          isCurrent: resumes.isCurrent,
          updatedAt: resumes.updatedAt,
        })
        .from(resumes)
        .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
    : []

  const scores = {
    lisibilite: output.scores?.lisibilite ?? 0,
    impact: output.scores?.impact ?? 0,
    motsCles: output.scores?.motsCles ?? 0,
    coherence: output.scores?.coherence ?? 0,
  }
  // Reviews stored in another shape (older or hand-made) must not show a score of 0.
  const rated = Object.values(output.scores ?? {}).filter(
    (value): value is number => typeof value === 'number',
  )
  return {
    generationId: row.id,
    createdAt: row.createdAt.toISOString(),
    resumeId: resume?.id ?? '',
    resumeTitle: resume?.title ?? '',
    isCurrentVersion: resume?.isCurrent ?? false,
    documentChangedSince: resume ? document.updatedAt > resume.updatedAt : true,
    score: rated.length === 4 ? average(rated) : null,
    scores,
    atsScore: typeof output.ats?.score === 'number' ? output.ats.score : null,
    atsSummary: output.ats?.summary ?? '',
    atsIssues: (output.ats?.checks ?? []).flatMap((check) =>
      check.status === 'ok' ? [] : [{ ...check, status: check.status }],
    ),
    improvements: output.improvements ?? [],
  }
}
