import type { ContentText } from 'pdfmake/interfaces'
import {
  formatCvDateRange,
  stripUnprintable,
  type CvContent,
  type CvLanguageCode,
} from '@piston/shared'
import type { CvIconName } from './icons'

/** Text helpers shared by the blocks: cleaning, links, dates, runs. */

/**
 * Cleans a user string for the PDF: NFC, trimmed, without characters the
 * fonts cannot print. Non-breaking spaces become plain spaces: the Carlito
 * subset has a broken glyph for U+00A0 that makes fontkit throw.
 */
export function clean(value: string): string {
  return stripUnprintable(value)
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .trim()
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

/** Runs joined by a separator, as a single text node's inline content. */
export function joinRuns(runs: ContentText[], separator: string): ContentText[] {
  return runs.flatMap((run, index) => (index === 0 ? [run] : [{ text: separator }, run]))
}

/** Joins the non-empty cleaned parts. */
export function join(parts: string[], separator: string): string {
  return parts.map(clean).filter(Boolean).join(separator)
}

export function dateRange(start: string, end: string, language: CvLanguageCode): string {
  return formatCvDateRange(clean(start), clean(end), language)
}

/** « Title — Organization »: the title in bold, the rest regular; either may be empty. */
export function headingRuns(main: string, secondary: string): ContentText[] {
  const first = clean(main)
  const second = clean(secondary)
  if (first && second) return [{ text: first, bold: true }, { text: ` — ${second}` }]
  return [{ text: first || second, bold: Boolean(first) }]
}

/** One contact detail of the header, with its content id and icon. */
export interface ContactEntry {
  id: string
  text: string
  target: string | undefined
  icon: CvIconName
}

/** The contact details in display order: e-mail, phone, city, links. */
export function contactEntries(content: CvContent): ContactEntry[] {
  const { email, phone, city, links } = content.header
  const entries: ContactEntry[] = []
  if (clean(email)) {
    entries.push({
      id: 'header.email',
      text: clean(email),
      target: linkTarget('email', email),
      icon: 'mail',
    })
  }
  if (clean(phone)) {
    entries.push({
      id: 'header.phone',
      text: clean(phone),
      target: linkTarget('phone', phone),
      icon: 'phone',
    })
  }
  if (clean(city)) {
    entries.push({ id: 'header.city', text: clean(city), target: undefined, icon: 'map-pin' })
  }
  for (const link of links) {
    if (!clean(link.url)) continue
    const label = clean(link.label)
    const url = displayUrl(link.url)
    const host = url.toLowerCase()
    entries.push({
      id: `header.link.${link.id}`,
      text: label ? `${label} : ${url}` : url,
      target: linkTarget('url', link.url),
      icon: host.includes('linkedin.') ? 'linkedin' : host.includes('github.') ? 'github' : 'globe',
    })
  }
  return entries
}
