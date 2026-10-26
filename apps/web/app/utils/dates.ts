/*
 * Date formatting for the whole app, in French. Pages used to build their own
 * Intl.DateTimeFormat with slightly different options; these helpers keep
 * one look per kind of date. Formatters are created once (they are costly).
 */

const formats = {
  /** « 26 oct. 2026 »: lists (offers, CVs, resume versions). */
  medium: new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }),
  /** « 26 octobre 2026 »: a date in a sentence (« Ajouté le … »). */
  long: new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }),
}
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const timeFormat = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' })
const relativeFormat = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })

/** A calendar date, without the time. */
export function formatDate(iso: string, style: keyof typeof formats = 'medium'): string {
  return formats[style].format(new Date(iso))
}

/** « 26 oct. 2026, 14:32 »: history entries, status changes. */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso))
}

/**
 * « à l'instant », « il y a 5 min », « il y a 3 h », « hier à 14:32 », then the
 * full date and time. Meant for recent events (letter versions); the absolute
 * date stays available in the `datetime` attribute and a title.
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return relativeFormat.format(-minutes, 'minute')
  if (minutes < 6 * 60) return relativeFormat.format(-Math.round(minutes / 60), 'hour')
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 3_600_000)
  if (date >= startOfToday) return `aujourd'hui à ${timeFormat.format(date)}`
  if (date >= startOfYesterday) return `hier à ${timeFormat.format(date)}`
  return formatDateTime(iso)
}
