import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import {
  cvTemplates,
  resolveCvDesign,
  type CvContent,
  type CvDesign,
  type CvTemplateId,
} from '@piston/shared'
import type { Region } from '../engine/boxes'
import type { BlockContext } from '../engine/context'
import { bandBlock, bandRegion, headerBlock } from '../engine/header'
import { clean } from '../engine/text'
import { computeTokens } from '../engine/tokens'
import { cvPairingFamilies, prepareCvPdfMake } from '../fonts'
import type { CvPdfEngine } from '../pdf'
import type { CvAssets } from '../types'

/**
 * « Lettre assortie »: a cover letter in the look of a CV document. The
 * header block (name, title, contact, photo), the palette, the font pairing
 * and the margins are the CV's own: the letter is drawn with the same engine
 * blocks and tokens as the CV, so the two documents read as a set.
 *
 * The letter is always one column. A sidebar header (contact in the side
 * column) has no side column here, so it falls back to the plain left header.
 */

export interface CvLetterInput {
  /** The CV whose header (name, title, contact, photo) the letter carries. */
  content: CvContent
  design: CvDesign
  templateId: CvTemplateId
  /** The letter, one entry per paragraph (a paragraph may contain line breaks). */
  paragraphs: string[]
  /** Who the letter is addressed to: company name, and an optional place line. */
  recipient?: { company?: string; lines?: string[] }
  /** The line printed above the letter on the right, e.g. « Paris, le 3 mars 2026 ». */
  dateLine?: string
}

/** « le 3 mars 2026 » / « 3 March 2026 », in the document's language. */
export function formatLetterDate(date: Date, language: 'fr' | 'en', place = ''): string {
  const formatted = new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
  const dated = language === 'fr' ? `le ${formatted}` : formatted
  return place.trim() ? `${place.trim()}, ${dated}` : dated
}

/** The letter as a pdfmake document definition. Pure, like `render`. */
export function renderLetter(input: CvLetterInput, assets: CvAssets = {}): TDocumentDefinitions {
  const resolved = resolveCvDesign(cvTemplates[input.templateId], input.design)
  const band = resolved.layout === 'banner' || resolved.headerStyle === 'band'
  const t = computeTokens({
    ...resolved,
    layout: 'single',
    headerStyle: resolved.headerStyle === 'sidebar' ? 'left' : resolved.headerStyle,
  })
  const { width: W } = t.page
  const x = t.margins.x
  const full: Region = { left: x, right: W - x, side: false }
  const context = (region: Region): BlockContext => ({
    t,
    content: input.content,
    assets,
    region,
  })

  const header: Content[] = band
    ? [
        bandBlock(
          context(bandRegion(context(full))),
          headerBlock(context(bandRegion(context(full))), { contactInSide: false, band: true }),
          { left: x, top: t.margins.top, right: x },
        ),
      ]
    : headerBlock(context(full), { contactInSide: false, band: false })

  const recipientLines = [clean(input.recipient?.company ?? ''), ...(input.recipient?.lines ?? [])]
    .map((line) => line.trim())
    .filter(Boolean)
  const body: Content[] = [
    ...(input.dateLine
      ? [
          {
            text: input.dateLine,
            alignment: 'right',
            color: t.colors.muted,
            margin: [0, t.space(26), 0, t.space(6)],
          } as Content,
        ]
      : []),
    ...(recipientLines.length
      ? [
          {
            stack: recipientLines.map((line, index) => ({
              text: line,
              bold: index === 0,
              color: t.colors.text,
            })),
            margin: [0, input.dateLine ? 0 : t.space(26), 0, t.space(18)],
          } as Content,
        ]
      : []),
    ...input.paragraphs
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map(
        (paragraph, index) =>
          ({
            text: paragraph,
            fontSize: t.size.base * 1.04,
            // Room under the header when neither a date nor a recipient is printed.
            margin: [
              0,
              index === 0 && !input.dateLine && !recipientLines.length ? t.space(26) : 0,
              0,
              t.space(9),
            ],
          }) as Content,
      ),
  ]

  const name = clean(input.content.header.fullName)
  return {
    pageSize: { width: W, height: t.page.height },
    pageMargins: [x, t.margins.top, x, t.margins.bottom],
    language: resolved.language === 'fr' ? 'fr-FR' : 'en-GB',
    info: {
      title: name ? `Lettre de motivation — ${name}` : 'Lettre de motivation',
      author: name || undefined,
      creator: 'Piston',
      producer: 'Piston (pdfmake)',
    },
    defaultStyle: {
      font: t.fonts.body,
      fontSize: t.size.base,
      color: t.colors.text,
      lineHeight: t.lineHeight + 0.08,
    },
    content: [{ stack: [...header, ...body] }],
  }
}

/** The letter as PDF bytes, with the fonts of the CV's pairing. */
export async function renderLetterPdf(
  input: CvLetterInput,
  assets: CvAssets,
  engine: CvPdfEngine,
): Promise<Uint8Array> {
  const resolved = resolveCvDesign(cvTemplates[input.templateId], input.design)
  await prepareCvPdfMake(engine.pdfmake, cvPairingFamilies(resolved.fontPairing), engine.loadFont)
  const buffer = await engine.pdfmake.createPdf(renderLetter(input, assets)).getBuffer()
  return new Uint8Array(buffer)
}
