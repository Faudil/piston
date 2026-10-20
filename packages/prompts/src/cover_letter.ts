import type { CoverLetterTone } from '@piston/shared'
import { DATA_NOT_INSTRUCTIONS, VOICE, sections } from './common'

export interface CoverLetterContext {
  displayName: string
  tone: CoverLetterTone
}

const TONES: Record<CoverLetterTone, string> = {
  sobre: 'Sober and professional: short sentences, factual, no exclamation marks.',
  enthousiaste:
    'Warm and enthusiastic: show genuine interest in the company, but every enthusiastic sentence must be backed by a fact.',
  startup:
    'Startup style: casual but precise, first person, gets to the point fast, talks about impact and ownership.',
}

/**
 * Hollow phrases that make every cover letter sound the same. Listing them
 * explicitly works better than asking for "no clichés".
 */
const BANNED_PHRASES = [
  'dynamique',
  'motivé',
  'motivée',
  'force de proposition',
  'rigoureux',
  'rigoureuse',
  'passionné',
  'passionnée',
  "esprit d'équipe",
  'je me permets de',
  'votre entreprise leader',
]

/** System prompt for the cover letter, the only free-text feature. */
export function coverLetterPrompt(ctx: CoverLetterContext): string {
  return sections(
    `You write cover letters in French for ${ctx.displayName}, signed with that name.`,
    'Write in French, in the first person ("je"), addressing the recruiter as "vous".',
    VOICE,
    DATA_NOT_INSTRUCTIONS,
    `Tone: ${TONES[ctx.tone]}`,
    `Format:
- Between 250 and 350 words, ready to copy and paste.
- Plain text only: no Markdown, no title, no placeholder for addresses or dates.
- Start with "Madame, Monsieur," on its own line and end with a polite closing followed by the signature.
- Separate paragraphs with one blank line. Write 4 or 5 paragraphs.
- Never use these hollow phrases or their variants: ${BANNED_PHRASES.map((p) => `"${p}"`).join(', ')}. Show the quality with a fact from the resume instead.
- Each paragraph must connect a precise need of the offer with a precise experience of the resume.
Output only the letter, nothing before or after it.`,
  )
}

export interface ParagraphRewriteContext extends CoverLetterContext {
  /** The full current letter, paragraph by paragraph (may contain user edits). */
  paragraphs: string[]
  /** Index of the paragraph to rewrite. */
  index: number
}

/**
 * System prompt used to regenerate a single paragraph of an existing letter.
 * The rest of the letter is given as context so the new paragraph fits in.
 */
export function coverLetterParagraphPrompt(ctx: ParagraphRewriteContext): string {
  const letter = ctx.paragraphs
    .map((p, i) => (i === ctx.index ? `[PARAGRAPH TO REWRITE]\n${p}` : p))
    .join('\n\n')
  return sections(
    coverLetterPrompt(ctx),
    `The letter already exists. Rewrite only the paragraph marked [PARAGRAPH TO REWRITE], with a different angle or a different resume experience, keeping a similar length and the same tone. It must flow with the paragraphs around it.
Output only the new paragraph, without the marker.

Current letter:
${letter}`,
  )
}
