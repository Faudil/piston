import type { Content, ContentText, TDocumentDefinitions } from 'pdfmake/interfaces'
import {
  cvSectionTitle,
  formatCvDateRange,
  renderedCvSections,
  stripUnprintable,
  type CvContent,
  type CvDesign,
  type CvFont,
  type CvSectionConfig,
  type CvSectionKey,
} from '@piston/shared'

/**
 * Helpers shared by every CV template: text cleaning, links, dates, sizes.
 * A template is a pure function `(input) => TDocumentDefinitions`; see
 * ./templates and CONTRIBUTING.md (« Adding a CV template »).
 */

export interface CvRenderInput {
  content: CvContent
  design: CvDesign
}

export type CvTemplate = (input: CvRenderInput) => TDocumentDefinitions

/** pdfmake font family names, registered in ./fonts.ts. */
export const PDF_FONT_FAMILY: Record<CvFont, string> = {
  inter: 'Inter',
  lato: 'Lato',
  'source-serif': 'SourceSerif',
}

/** A4 in PDF points. */
export const A4 = { width: 595.28, height: 841.89 } as const

export const MUTED = '#57534e'
export const TEXT = '#1c1917'

/**
 * Font sizes and spacings for a density. `base` is the body size; templates
 * derive the others from it so the three densities stay proportional.
 */
export function scale(density: CvDesign['density']) {
  const factor = { comfortable: 1.06, normal: 1, compact: 0.92 }[density]
  const space = { comfortable: 1.3, normal: 1, compact: 0.72 }[density]
  return {
    size: (points: number) => Math.round(points * factor * 10) / 10,
    space: (points: number) => Math.round(points * space * 10) / 10,
  }
}

/** Cleans a user string for the PDF: trims and removes characters the fonts cannot print. */
export function clean(value: string): string {
  return stripUnprintable(value).trim()
}

/**
 * Where a link points, or undefined if it should not be clickable. Only
 * web, e-mail and phone links: nothing else (javascript:, file:...) ever
 * becomes an action in the PDF.
 */
export function linkTarget(kind: 'url' | 'email' | 'phone', value: string): string | undefined {
  const v = value.trim()
  if (!v) return undefined
  if (kind === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? `mailto:${v}` : undefined
  if (kind === 'phone') {
    const digits = v.replace(/[^\d+]/g, '')
    return digits.length >= 6 ? `tel:${digits}` : undefined
  }
  if (/^https?:\/\/[^\s]+$/i.test(v)) return v
  // « linkedin.com/in/camille » is a link too.
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) return `https://${v}`
  return undefined
}

/** A link as shown on the CV: « linkedin.com/in/camille » rather than the full URL. */
export function displayUrl(url: string): string {
  return clean(url)
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
}

/** One text run, clickable when the target is allowed. */
export function linked(text: string, target: string | undefined, color?: string): ContentText {
  return target ? { text, link: target, ...(color && { color }) } : { text }
}

/** The contact details as clickable runs: e-mail, phone, city, links. */
export function contactRuns(content: CvContent, linkColor?: string): ContentText[] {
  const { email, phone, city, links } = content.header
  const runs: ContentText[] = []
  if (clean(email)) runs.push(linked(clean(email), linkTarget('email', email), linkColor))
  if (clean(phone)) runs.push(linked(clean(phone), linkTarget('phone', phone), linkColor))
  if (clean(city)) runs.push({ text: clean(city) })
  for (const link of links) {
    if (!clean(link.url)) continue
    const label = clean(link.label)
    const shown = label ? `${label} : ${displayUrl(link.url)}` : displayUrl(link.url)
    runs.push(linked(shown, linkTarget('url', link.url), linkColor))
  }
  return runs
}

/** Runs joined by a separator, as a single text node's inline content. */
export function joinRuns(runs: ContentText[], separator: string): ContentText[] {
  return runs.flatMap((run, index) => (index === 0 ? [run] : [{ text: separator }, run]))
}

export function dateRange(start: string, end: string, design: CvDesign): string {
  return formatCvDateRange(clean(start), clean(end), design.language)
}

/** The sections to render in order (visible, non-empty), with their titles. */
export function sectionsToRender(content: CvContent, design: CvDesign) {
  return renderedCvSections(content).map((section: CvSectionConfig) => ({
    key: section.key as CvSectionKey,
    title: clean(cvSectionTitle(section, design.language)),
  }))
}

/** « Title — Organization »: the title in bold, the rest regular; either may be empty. */
export function headingRuns(main: string, secondary: string): ContentText[] {
  const first = clean(main)
  const second = clean(secondary)
  if (first && second) return [{ text: first, bold: true }, { text: ` — ${second}` }]
  return [{ text: first || second, bold: Boolean(first) }]
}

/** Joins non-empty parts. */
export function join(parts: string[], separator: string): string {
  return parts.map(clean).filter(Boolean).join(separator)
}

/** Mixes a #rrggbb color with white: 0 = the color, 1 = white. */
export function tint(hex: string, amount: number): string {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16))
  return `#${channels
    .map((channel) => Math.round(channel + (255 - channel) * amount))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

/** Document metadata and settings common to every template. */
export function baseDocument(input: CvRenderInput): Omit<TDocumentDefinitions, 'content'> {
  const { header } = input.content
  const name = clean(header.fullName)
  return {
    pageSize: 'A4',
    language: input.design.language === 'fr' ? 'fr-FR' : 'en-GB',
    info: {
      title: name ? `CV — ${name}` : 'CV',
      author: name || undefined,
      subject: clean(header.title) || undefined,
      creator: 'Piston',
      producer: 'Piston (pdfmake)',
    },
    defaultStyle: {
      font: PDF_FONT_FAMILY[input.design.font],
      color: TEXT,
      lineHeight: 1.2,
    },
  }
}

/** Bulleted list of an item, or nothing. */
export function bulletList(
  bullets: Array<{ text: string }>,
  options: { fontSize: number; markerColor: string; margin: [number, number, number, number] },
): Content[] {
  const items = bullets.map((bullet) => clean(bullet.text)).filter(Boolean)
  if (!items.length) return []
  return [
    {
      ul: items,
      markerColor: options.markerColor,
      fontSize: options.fontSize,
      margin: options.margin,
    },
  ]
}
