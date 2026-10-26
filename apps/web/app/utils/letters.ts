import {
  coverLetterTemplateLabels,
  type CoverLetterTemplate,
  type Generation,
} from '@piston/shared'

/*
 * A cover letter is stored as a flat `paragraphs: string[]` (see
 * CoverLetterOutput). The editor shows it in three parts, derived on the fly
 * so the stored format never changes:
 *
 * - header: the « Objet : … » line of an e-mail and the salutation
 *   (« Madame, Monsieur, », « Bonjour, »);
 * - body: the paragraphs that carry content, numbered, counted and
 *   regenerable one by one;
 * - footer: the closing formula and the signature.
 *
 * Detection is by position and wording: at most two lines at the start, three
 * at the end, and only lines that look like a salutation, a subject, a
 * one-sentence closing formula or a name. A line glued to the body (« Madame,
 * Monsieur,\nVotre annonce… ») is split from it, so joining the parts back
 * can turn one stored paragraph into two; the editor compares joined forms,
 * so that alone never counts as an unsaved change. When in doubt a line stays
 * in the body, and a letter whose body would end up empty is all body.
 */

export interface LetterParts {
  header: string[]
  body: string[]
  footer: string[]
}

const MAX_HEADER_LINES = 2
const MAX_FOOTER_LINES = 3

const SUBJECT = /^objet\s*:/i
const SALUTATION =
  /^(madame|monsieur|mesdames|messieurs|bonjour|bonsoir|cher|chère|chers|chères|hello)\b.{0,60},$/i
const CLOSING =
  /(salutations|agréer|cordialement|sincèrement|considération|bien à vous|respectueu|amicalement|belle journée)/i

/** One sentence at most: a closing formula, not a paragraph that also asks for an interview. */
function isOneSentence(line: string) {
  return line.split(/[.!?](?:\s|$)/).filter((part) => part.trim()).length <= 1
}

function isHeaderLine(line: string) {
  const text = line.trim()
  return SUBJECT.test(text) || (text.length <= 80 && SALUTATION.test(text))
}

/** A short line starting with a capital, without final punctuation: a name. */
export function isSignatureLine(line: string) {
  const text = line.trim()
  const words = text.split(/\s+/)
  return (
    text.length <= 60 &&
    words.length <= 6 &&
    /^\p{Lu}/u.test(text) &&
    !/[.!?:;,]$/.test(text) &&
    !CLOSING.test(text)
  )
}

function isClosing(line: string) {
  const text = line.trim()
  return text.length <= 300 && CLOSING.test(text) && isOneSentence(text)
}

/** Splits a stored letter into header, body and footer (see above). */
export function splitLetter(paragraphs: readonly string[]): LetterParts {
  const blocks = paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean)

  const header: string[] = []
  while (blocks.length && header.length < MAX_HEADER_LINES) {
    const [first = '', ...rest] = blocks[0]!.split('\n')
    if (!isHeaderLine(first)) break
    header.push(first.trim())
    const remaining = rest.join('\n').trim()
    if (remaining) blocks[0] = remaining
    else blocks.shift()
  }

  const footer: string[] = []
  while (blocks.length && footer.length < MAX_FOOTER_LINES) {
    const lines = blocks.at(-1)!.split('\n')
    const last = lines.at(-1)!
    // The signature is the very last line; the closing formula comes before it.
    const matches = footer.length === 0 ? isSignatureLine(last) || isClosing(last) : isClosing(last)
    if (!matches) break
    footer.unshift(last.trim())
    const remaining = lines.slice(0, -1).join('\n').trim()
    if (remaining) blocks[blocks.length - 1] = remaining
    else blocks.pop()
  }

  if (blocks.length === 0) {
    return { header: [], body: paragraphs.map((p) => p.trim()).filter(Boolean), footer: [] }
  }
  return { header, body: blocks, footer }
}

/** The paragraphs to store: one paragraph per header and footer line, then the body. */
export function joinLetter(parts: LetterParts): string[] {
  return [...parts.header, ...parts.body, ...parts.footer]
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

/** Words of the body only: the salutation and the signature are not « the letter ». */
export function countWords(paragraphs: readonly string[]): number {
  return paragraphs.join(' ').split(/\s+/).filter(Boolean).length
}

type LetterVersion = Pick<Generation<'cover_letter'>, 'inputRefs' | 'output'>

const EXCERPT_LENGTH = 80

/**
 * What made a version, as shown in the version list: « Nouvelle lettre »,
 * « Corrections : plus court », « Paragraphe 2 réécrit ». The paragraph number
 * counts body paragraphs, like the editor; the stored index counts every
 * paragraph, so the version's own header is subtracted.
 */
export function letterVersionLabel(letter: LetterVersion): string {
  const { revisionInstructions, paragraphIndex } = letter.inputRefs
  if (revisionInstructions) {
    const text = revisionInstructions.replace(/\s+/g, ' ').trim()
    const excerpt = text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}…` : text
    return `Corrections : ${excerpt}`
  }
  if (paragraphIndex !== undefined) {
    const headerLength = splitLetter(letter.output.paragraphs).header.length
    const number = paragraphIndex - headerLength + 1
    return `Paragraphe ${number >= 1 ? number : paragraphIndex + 1} réécrit`
  }
  return 'Nouvelle lettre'
}

/** Letters written before templates existed used the classic structure. */
export function letterTemplate(letter: Pick<LetterVersion, 'inputRefs'>): CoverLetterTemplate {
  const template = letter.inputRefs.template as CoverLetterTemplate | undefined
  return template && template in coverLetterTemplateLabels ? template : 'classique'
}

/**
 * The template label to show next to a version, only when it differs from the
 * version before it (`previous`, the older one), so a list of versions of the
 * same letter does not repeat « Classique » on every line.
 */
export function changedTemplateLabel(
  letter: Pick<LetterVersion, 'inputRefs'>,
  previous: Pick<LetterVersion, 'inputRefs'> | undefined,
): string | null {
  const template = letterTemplate(letter)
  if (previous && letterTemplate(previous) === template) return null
  return coverLetterTemplateLabels[template]
}

/** "Acme Corp" → "lettre-acme-corp", for exported file names. */
export function letterFilename(name: string | null | undefined): string {
  const slug = (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `lettre-${slug || 'motivation'}`
}
