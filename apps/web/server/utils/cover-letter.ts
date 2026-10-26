import { wrapNotes } from '@piston/prompts'
import { and, applications, desc, eq, generations, inArray, jobOffers, sql } from '@piston/db'
import type { CoverLetterOutput, Generation, LetterSummary } from '@piston/shared'

/*
 * Cover letters are stored as a list of paragraphs (see CoverLetterOutput) so
 * that a single paragraph can be regenerated or edited.
 */

/** Splits Claude's free text on blank lines into trimmed, non-empty paragraphs. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

/**
 * Returns the letter with only paragraph `index` replaced by `text`. Claude is
 * asked for a single paragraph; if it still writes several, they are merged
 * into one so the other paragraphs keep their positions.
 */
export function replaceParagraph(paragraphs: string[], index: number, text: string): string[] {
  const replacement = splitParagraphs(text).join('\n')
  if (!replacement) {
    throw new UnusableAnswerError("Claude n'a pas réécrit le paragraphe. Réessaie.")
  }
  return paragraphs.map((paragraph, i) => (i === index ? replacement : paragraph))
}

/** Parses a full letter written by Claude. */
export function parseCoverLetter(text: string): CoverLetterOutput {
  const paragraphs = splitParagraphs(text)
  if (paragraphs.length === 0) {
    throw new UnusableAnswerError("Claude n'a pas écrit de lettre. Réessaie.")
  }
  return { paragraphs }
}

/** What the request asks Claude to do with the letter. */
export type CoverLetterTask = 'letter' | 'paragraph' | 'revision'

const TASKS: Record<CoverLetterTask, string> = {
  letter: 'Write the cover letter for this offer.',
  paragraph: 'Rewrite the marked paragraph of the cover letter for this offer.',
  revision: 'Revise the cover letter for this offer following the corrections.',
}

/**
 * The instruction sent with the offer. Highlights and application notes stay
 * out of the system prompt so it can be cached; notes are user text, so they
 * are wrapped in <notes> tags like the resume and the offer.
 */
export function coverLetterInstruction(
  task: CoverLetterTask,
  highlights: string[],
  notes = '',
): string {
  const parts = [TASKS[task]]
  if (highlights.length > 0) {
    parts.push(
      `The user wants these points highlighted, each backed by the resume:\n${highlights
        .map((highlight) => `- ${highlight}`)
        .join('\n')}`,
    )
  }
  if (notes.trim()) {
    parts.push(`The user's notes about this application:\n${wrapNotes(notes)}`)
  }
  return parts.join('\n')
}

/**
 * Loads the application a letter is written for. It must belong to the user
 * (404) and be the application of the offer the letter is about (400).
 */
export async function getApplicationForLetter(
  userId: string,
  applicationId: string,
  offerId: string,
) {
  const { application } = await getApplicationForUser(userId, applicationId)
  if (application.jobOfferId !== offerId) {
    throw createError({
      statusCode: 400,
      message: "Cette candidature ne correspond pas à l'offre choisie.",
    })
  }
  return application
}

/** Cover letters written for one application of the user, newest first. */
export async function listApplicationLetters(userId: string, applicationId: string) {
  const rows = await useDb()
    .select()
    .from(generations)
    .where(
      and(
        eq(generations.userId, userId),
        eq(generations.kind, 'cover_letter'),
        sql`${generations.inputRefs}->>'applicationId' = ${applicationId}`,
      ),
    )
    .orderBy(desc(generations.createdAt))
  return rows.map((row) => toGeneration(row) as Generation<'cover_letter'>)
}

/**
 * Every cover letter of one offer, newest first, whichever page it was written
 * from: an offer has at most one application, so its letters are a single
 * history shared by the offer page and the application's letter page.
 */
export async function listOfferLetters(userId: string, offerId: string) {
  const rows = await useDb()
    .select()
    .from(generations)
    .where(
      and(
        eq(generations.userId, userId),
        eq(generations.kind, 'cover_letter'),
        sql`${generations.inputRefs}->>'offerId' = ${offerId}`,
      ),
    )
    .orderBy(desc(generations.createdAt))
  return rows.map((row) => toGeneration(row) as Generation<'cover_letter'>)
}

/** Returns one of the user's cover letters, or throws a 404. */
export async function getUserCoverLetter(userId: string, generationId: string) {
  const generation = await useDb().query.generations.findFirst({
    where: and(
      eq(generations.id, generationId),
      eq(generations.userId, userId),
      eq(generations.kind, 'cover_letter'),
    ),
  })
  if (!generation) throw createError({ statusCode: 404, message: 'Lettre introuvable.' })
  return generation
}

/**
 * Every cover letter of the user, grouped into one entry per offer (the offer
 * page and the application's letter page share one history), newest activity
 * first. `applicationId` is the offer's application when it is tracked, so
 * the entry opens the letter page of the application. A ~10-user app has at
 * most a few hundred letters: grouping in memory keeps this readable without
 * a GROUP BY over JSON fields.
 */
export async function listLetterSummaries(userId: string): Promise<LetterSummary[]> {
  const rows = await useDb()
    .select()
    .from(generations)
    .where(and(eq(generations.userId, userId), eq(generations.kind, 'cover_letter')))
    .orderBy(desc(generations.createdAt))

  // Rows are newest first, so the first row seen for an offer is its latest version.
  const groups = new Map<string, { latest: (typeof rows)[number]; versions: number }>()
  for (const row of rows) {
    const { offerId } = row.inputRefs
    if (!offerId) continue
    const group = groups.get(offerId)
    if (group) group.versions++
    else groups.set(offerId, { latest: row, versions: 1 })
  }

  const offerIds = [...groups.keys()]
  const [offers, tracked] = offerIds.length
    ? await Promise.all([
        useDb()
          .select({ id: jobOffers.id, title: jobOffers.title, company: jobOffers.company })
          .from(jobOffers)
          .where(and(eq(jobOffers.userId, userId), inArray(jobOffers.id, offerIds))),
        useDb()
          .select({ id: applications.id, offerId: applications.jobOfferId })
          .from(applications)
          .where(and(eq(applications.userId, userId), inArray(applications.jobOfferId, offerIds))),
      ])
    : [[], []]
  const offersById = new Map(offers.map((offer) => [offer.id, offer]))
  const applicationByOffer = new Map(tracked.map((row) => [row.offerId, row.id]))

  return [...groups.entries()].flatMap(([offerId, { latest, versions }]) => {
    // Letters of a deleted offer stay in the history but have no page to open.
    const offer = offersById.get(offerId)
    if (!offer) return []
    const { paragraphs } = latest.output as CoverLetterOutput
    // Skip the salutation ("Madame, Monsieur,") to show actual content.
    const body = paragraphs.find((p, i) => i > 0 && p.length > 40) ?? paragraphs[0] ?? ''
    return [
      {
        generationId: latest.id,
        offer,
        applicationId: applicationByOffer.get(offerId) ?? null,
        template: latest.inputRefs.template ?? null,
        versions,
        excerpt: body.slice(0, 160),
        updatedAt: latest.createdAt.toISOString(),
      },
    ]
  })
}
