import { and, eq, generations } from '@piston/db'
import type { CoverLetterOutput } from '@piston/shared'

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

/** The instruction sent with the offer. Highlights stay out of the system prompt so it can be cached. */
export function coverLetterInstruction(highlights: string[], paragraphOnly: boolean): string {
  const task = paragraphOnly
    ? 'Rewrite the marked paragraph of the cover letter for this offer.'
    : 'Write the cover letter for this offer.'
  if (highlights.length === 0) return task
  return `${task}\nThe user wants these points highlighted, each backed by the resume:\n${highlights
    .map((highlight) => `- ${highlight}`)
    .join('\n')}`
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
