import { wrapNotes } from '@piston/prompts'
import { and, desc, eq, generations, sql } from '@piston/db'
import type { CoverLetterOutput, Generation } from '@piston/shared'

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
