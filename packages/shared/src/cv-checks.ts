import { cvSectionTitle, type CvContent, type CvListSectionKey } from './cv'
import type { CvDesign, CvSpacing } from './cv-design'
import { cvTemplates, isTwoColumnLayout, resolveCvDesign, type CvTemplateId } from './cv-templates'
import { isCvSectionEmpty, isPresentDate } from './cv-text'

/**
 * Instant, deterministic checks of a CV document (no AI), shown next to the
 * preview. Every message is French and actionable.
 */

export type CvCheckLevel = 'error' | 'warning' | 'info'

export interface CvCheck {
  /** Stable id, e.g. `missing-email` or `date-format:experiences:abc123:start`. */
  id: string
  level: CvCheckLevel
  message: string
  /** What the check is about, so the editor can link to it. */
  target?: {
    section: CvListSectionKey | 'summary' | 'header' | 'custom'
    itemId?: string
    /** For `custom`: the custom section's id. */
    customId?: string
  }
}

export const CV_CHECK_THRESHOLDS = {
  maxBulletLength: 220,
  minBulletLength: 15,
  maxSummaryLength: 600,
  maxPages: 2,
} as const

/** « 03/2021 », « 2021 » or a "present" word. */
const DATE_PATTERN = /^(?:(0[1-9]|1[0-2])\/)?(\d{4})$/

/**
 * Characters printed by the PDF fonts: their Latin and Latin Extended subsets
 * (Fontsource's « latin » + « latin-ext » ranges, see
 * packages/cv-render/scripts/build-fonts.sh). French, Polish, Czech,
 * Turkish, Romanian... are covered; emoji, symbols, Greek, Cyrillic, CJK are not.
 */
const PRINTABLE =
  /^(?:[\t\n\r\u0020-\u007e\u00a0-\u02cc\u02ce-\u02d7\u02da\u02dc-\u02ff\u1d00-\u1dbf\u1e00-\u1e9f\u1ef2-\u1eff\u2000-\u206f\u20a0-\u20c0\u2113\u2122\u2191\u2193\u2212\u2215\u2c60-\u2c7f\ua720-\ua7ff\ufeff\ufffd]|\u0304|\u0308|\u0329)*$/u

/**
 * Characters the CV fonts cannot print (emoji, symbols, non-Latin scripts),
 * deduplicated. Text is compared in NFC form, so a decomposed « é » (e +
 * combining accent, common when pasting from macOS) counts as printable.
 */
export function unprintableCharacters(raw: string): string[] {
  const value = raw.normalize('NFC')
  if (PRINTABLE.test(value)) return []
  const found = new Set<string>()
  for (const char of value) if (!PRINTABLE.test(char)) found.add(char)
  return [...found]
}

/** Removes what the fonts cannot print, so the PDF has no invisible glyphs. Returns NFC text. */
export function stripUnprintable(raw: string): string {
  const value = raw.normalize('NFC')
  if (PRINTABLE.test(value)) return value
  let out = ''
  for (const char of value) if (PRINTABLE.test(char)) out += char
  return out
}

/** Sortable month index of a date (« 03/2021 » → 2021*12+2), null if not a date. */
function monthIndex(value: string, endOfYear: boolean): number | null {
  const match = DATE_PATTERN.exec(value.trim())
  if (!match) return null
  const year = Number(match[2])
  const month = match[1] ? Number(match[1]) - 1 : endOfYear ? 11 : 0
  return year * 12 + month
}

/** Every text of the document, for the placeholder and character checks. */
function allTexts(content: CvContent): string[] {
  const { header } = content
  return [
    header.fullName,
    header.title,
    header.email,
    header.phone,
    header.city,
    ...header.links.flatMap((link) => [link.label, link.url]),
    content.summary,
    ...[...content.experiences, ...content.volunteering].flatMap((item) => [
      item.title,
      item.organization,
      item.location,
      ...item.bullets.map((bullet) => bullet.text),
    ]),
    ...content.education.flatMap((item) => [item.degree, item.school, item.location, item.details]),
    ...content.skills.flatMap((group) => [group.name, ...group.items.map((skill) => skill.name)]),
    ...content.languages.flatMap((item) => [item.name, item.level]),
    ...content.projects.flatMap((item) => [
      item.name,
      item.role,
      ...item.bullets.map((bullet) => bullet.text),
    ]),
    ...content.certifications.flatMap((item) => [item.name, item.issuer]),
    ...content.interests.flatMap((item) => [item.name, item.details]),
    ...content.awards.flatMap((item) => [item.name, item.issuer, item.details]),
    ...content.publications.flatMap((item) => [item.title, item.publisher]),
    ...content.references.flatMap((item) => [
      item.name,
      item.role,
      item.organization,
      item.contact,
    ]),
    ...content.extras.map((item) => item.text),
    ...content.custom.flatMap((section) => [
      section.title,
      ...section.items.flatMap((item) => [item.title, item.subtitle, item.date, item.text]),
    ]),
  ]
}

/**
 * Rough page estimate before the first PDF render: weighted lines against
 * what an A4 page of the given spacing holds. The real count from the
 * preview replaces it as soon as it is known.
 */
export function estimateCvPages(content: CvContent, spacing: CvSpacing = 'normal'): number {
  const charsPerLine = 95
  const lines = (value: string) => (value.trim() ? Math.ceil(value.length / charsPerLine) : 0)
  let total = 6 // header
  for (const section of content.sections) {
    if (!section.visible || isCvSectionEmpty(content, section)) continue
    total += 2.5
    if (section.key === 'custom') {
      const custom = content.custom.find((entry) => entry.id === section.customId)
      for (const item of custom?.items ?? []) total += 1 + lines(item.text)
      continue
    }
    if (section.key === 'summary') total += lines(content.summary)
    if (
      section.key === 'experiences' ||
      section.key === 'projects' ||
      section.key === 'volunteering'
    ) {
      for (const item of content[section.key]) {
        total += 2 + item.bullets.reduce((sum, bullet) => sum + lines(bullet.text), 0)
      }
    }
    if (section.key === 'education') {
      for (const item of content.education) total += 2 + lines(item.details)
    }
    if (section.key === 'skills') total += content.skills.length
    if (section.key === 'languages') total += Math.ceil(content.languages.length / 2)
    if (section.key === 'certifications') total += content.certifications.length
    if (section.key === 'interests') total += content.interests.length
    if (section.key === 'awards' || section.key === 'publications' || section.key === 'references')
      total += content[section.key].length * 1.5
    if (section.key === 'extras') total += content.extras.length
  }
  const perPage = { comfortable: 46, normal: 52, compact: 62 }[spacing]
  return Math.max(1, Math.ceil(total / perPage))
}

export function checkCv(
  content: CvContent,
  design: CvDesign,
  templateId: CvTemplateId,
  options: { pageCount?: number } = {},
): CvCheck[] {
  const checks: CvCheck[] = []
  const add = (check: CvCheck) => checks.push(check)
  const { header } = content
  const template = cvTemplates[templateId]
  const resolved = resolveCvDesign(template, design)

  // --- Header
  if (!header.fullName.trim()) {
    add({
      id: 'missing-name',
      level: 'error',
      message: 'Ajoute ton nom en haut du CV.',
      target: { section: 'header' },
    })
  }
  if (!header.title.trim()) {
    add({
      id: 'missing-title',
      level: 'warning',
      message:
        'Ajoute un titre sous ton nom (le poste visé) : c’est la première chose que lit un recruteur.',
      target: { section: 'header' },
    })
  }
  if (!header.email.trim()) {
    add({
      id: 'missing-email',
      level: 'error',
      message: 'Ajoute ton adresse e-mail.',
      target: { section: 'header' },
    })
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(header.email.trim())) {
    add({
      id: 'invalid-email',
      level: 'error',
      message: `L’adresse e-mail « ${header.email} » semble incorrecte.`,
      target: { section: 'header' },
    })
  }
  if (!header.phone.trim()) {
    add({
      id: 'missing-phone',
      level: 'warning',
      message: 'Ajoute ton numéro de téléphone.',
      target: { section: 'header' },
    })
  }
  if (!header.city.trim()) {
    add({
      id: 'missing-city',
      level: 'info',
      message: 'Indique ta ville : beaucoup de recruteurs (et d’ATS) filtrent par localisation.',
      target: { section: 'header' },
    })
  }
  for (const link of header.links) {
    if (
      link.url.trim() &&
      !/^https?:\/\//i.test(link.url.trim()) &&
      !/^[\w-]+(\.[\w-]+)+/.test(link.url.trim())
    ) {
      add({
        id: `link-url:${link.id}`,
        level: 'warning',
        message: `Le lien « ${link.url} » ne ressemble pas à une adresse web.`,
        target: { section: 'header' },
      })
    }
  }

  // --- Sections: one notice for all the empty ones, it is a single decision to make.
  const empty = content.sections.filter(
    (section) => section.visible && isCvSectionEmpty(content, section),
  )
  if (empty.length) {
    const titles = empty.map(
      (section) => `« ${cvSectionTitle(section, design.language, content.custom)} »`,
    )
    add({
      id: 'empty-sections',
      level: 'info',
      message:
        empty.length === 1
          ? `La section ${titles[0]} est vide : remplis-la ou masque-la (elle n’apparaît pas sur le PDF).`
          : `Ces sections sont vides : ${titles.join(', ')}. Remplis-les ou masque-les (elles n’apparaissent pas sur le PDF).`,
      target:
        empty[0]!.key === 'custom'
          ? { section: 'custom', customId: empty[0]!.customId }
          : { section: empty[0]!.key },
    })
  }

  // --- Summary
  if (content.summary.length > CV_CHECK_THRESHOLDS.maxSummaryLength) {
    add({
      id: 'long-summary',
      level: 'warning',
      message: `Ton accroche fait ${content.summary.length} caractères : vise moins de ${CV_CHECK_THRESHOLDS.maxSummaryLength} (3 ou 4 lignes).`,
      target: { section: 'summary' },
    })
  }

  // --- Items: bullets and dates
  for (const section of ['experiences', 'projects', 'volunteering'] as const) {
    for (const item of content[section]) {
      const name =
        ('title' in item ? item.title : item.name) ||
        {
          experiences: 'Expérience sans titre',
          projects: 'Projet sans nom',
          volunteering: 'Bénévolat sans titre',
        }[section]
      if (section === 'experiences' && item.bullets.length === 0) {
        add({
          id: `no-bullets:${item.id}`,
          level: 'warning',
          message: `« ${name} » n’a aucune puce : ajoute 2 à 4 réalisations concrètes.`,
          target: { section, itemId: item.id },
        })
      }
      for (const bullet of item.bullets) {
        const length = bullet.text.trim().length
        if (length > CV_CHECK_THRESHOLDS.maxBulletLength) {
          add({
            id: `long-bullet:${bullet.id}`,
            level: 'warning',
            message: `Une puce de « ${name} » fait ${length} caractères : coupe-la sous ${CV_CHECK_THRESHOLDS.maxBulletLength} (deux lignes au plus).`,
            target: { section, itemId: item.id },
          })
        } else if (length > 0 && length < CV_CHECK_THRESHOLDS.minBulletLength) {
          add({
            id: `short-bullet:${bullet.id}`,
            level: 'info',
            message: `Une puce de « ${name} » est très courte : précise ce que tu as fait et son résultat.`,
            target: { section, itemId: item.id },
          })
        }
      }
    }
  }

  const dated: Array<{
    section: CvListSectionKey
    id: string
    name: string
    start: string
    end: string
  }> = [
    ...content.experiences.map((item) => ({
      section: 'experiences' as const,
      id: item.id,
      name: item.title || 'Expérience',
      start: item.start,
      end: item.end,
    })),
    ...content.education.map((item) => ({
      section: 'education' as const,
      id: item.id,
      name: item.degree || 'Formation',
      start: item.start,
      end: item.end,
    })),
    ...content.projects.map((item) => ({
      section: 'projects' as const,
      id: item.id,
      name: item.name || 'Projet',
      start: item.start,
      end: item.end,
    })),
    ...content.volunteering.map((item) => ({
      section: 'volunteering' as const,
      id: item.id,
      name: item.title || 'Bénévolat',
      start: item.start,
      end: item.end,
    })),
  ]
  for (const item of dated) {
    for (const [field, value] of [
      ['start', item.start],
      ['end', item.end],
    ] as const) {
      const trimmed = value.trim()
      if (!trimmed || DATE_PATTERN.test(trimmed) || (field === 'end' && isPresentDate(trimmed)))
        continue
      add({
        id: `date-format:${item.id}:${field}`,
        level: 'warning',
        message: `« ${item.name} » : la date « ${trimmed} » n’est pas au format MM/AAAA, AAAA ou « Aujourd'hui ».`,
        target: { section: item.section, itemId: item.id },
      })
    }
    const start = monthIndex(item.start, false)
    const end = isPresentDate(item.end) ? Number.POSITIVE_INFINITY : monthIndex(item.end, true)
    if (start !== null && end !== null && end < start) {
      add({
        id: `date-order:${item.id}`,
        level: 'error',
        message: `« ${item.name} » : la date de fin est avant la date de début.`,
        target: { section: item.section, itemId: item.id },
      })
    }
  }

  // Most recent first: a current or later job below an older one usually is a mistake.
  const order = content.experiences.map((item) =>
    isPresentDate(item.end)
      ? Number.POSITIVE_INFINITY
      : (monthIndex(item.end, true) ?? monthIndex(item.start, false)),
  )
  for (let index = 1; index < order.length; index++) {
    const previous = order[index - 1]
    const current = order[index]
    if (previous != null && current != null && current > previous) {
      add({
        id: 'experience-order',
        level: 'info',
        message:
          'Tes expériences ne sont pas de la plus récente à la plus ancienne : c’est l’ordre attendu en France.',
        target: { section: 'experiences' },
      })
      break
    }
  }

  // --- Placeholders and characters
  const texts = allTexts(content)
  const placeholders = texts.filter((value) => /\[[^\]]{1,40}\]/.test(value)).length
  if (placeholders > 0) {
    add({
      id: 'placeholders',
      level: 'warning',
      message:
        placeholders === 1
          ? 'Il reste un passage entre crochets (comme « [X %] ») à remplir avec un vrai chiffre, ou à retirer.'
          : `Il reste ${placeholders} passages entre crochets (comme « [X %] ») à remplir avec de vrais chiffres, ou à retirer.`,
    })
  }
  const unprintable = [...new Set(texts.flatMap(unprintableCharacters))]
  if (unprintable.length) {
    add({
      id: 'unprintable',
      level: 'warning',
      message: `Ces caractères ne s’impriment pas dans le PDF et seront retirés : ${unprintable.slice(0, 8).join(' ')}`,
    })
  }

  // --- Length
  const pages = options.pageCount ?? estimateCvPages(content, resolved.spacing)
  const estimated = options.pageCount === undefined ? ' (estimation)' : ''
  if (pages > CV_CHECK_THRESHOLDS.maxPages) {
    add({
      id: 'pages',
      level: 'warning',
      message: `Ton CV fait ${pages} pages${estimated} : vise une page, deux au maximum. Le modèle « Compact » ou un espacement « Serré » peuvent aider.`,
    })
  } else if (pages === 2) {
    add({
      id: 'pages',
      level: 'info',
      message: `Ton CV fait 2 pages${estimated}. Avec moins de 10 ans d’expérience, une page suffit souvent.`,
    })
  }

  // --- Photo and references
  if (header.photo?.visible) {
    add({
      id: 'photo',
      level: 'info',
      message:
        design.language === 'en'
          ? 'Ton CV est en anglais : au Royaume-Uni, aux États-Unis ou au Canada, une photo est déconseillée (elle peut même faire écarter la candidature). Masque-la pour ces candidatures.'
          : 'La photo est courante en France, mais les logiciels de recrutement (ATS) l’ignorent et certains recruteurs préfèrent sans. Garde-la si elle est professionnelle.',
      target: { section: 'header' },
    })
  }
  const referencesShown = content.sections.some(
    (section) => section.key === 'references' && section.visible,
  )
  if (referencesShown && content.references.length && !content.referencesAvailableOnRequest) {
    add({
      id: 'references-consent',
      level: 'info',
      message:
        'Tes références apparaissent avec leurs coordonnées : vérifie qu’elles sont d’accord, ou choisis « Disponibles sur demande ».',
      target: { section: 'references' },
    })
  }

  // --- Levels drawn as gauges need levels
  const shown = (key: 'skills' | 'languages') =>
    content.sections.some((section) => section.key === key && section.visible) &&
    content[key].length > 0
  if (
    (resolved.skillStyle === 'bars' || resolved.skillStyle === 'dots') &&
    shown('skills') &&
    content.skills.every((group) => group.items.every((skill) => skill.level === 0))
  ) {
    add({
      id: 'skill-levels',
      level: 'info',
      message:
        'Le style de compétences choisi affiche des niveaux, mais aucune compétence n’en a : indique un niveau (1 à 5) ou choisis un autre style.',
      target: { section: 'skills' },
    })
  }
  if (
    (resolved.languageStyle === 'bars' ||
      resolved.languageStyle === 'dots' ||
      resolved.languageStyle === 'cefr') &&
    shown('languages') &&
    content.languages.some((language) => language.cefr === null)
  ) {
    add({
      id: 'language-levels',
      level: 'info',
      message:
        'Le style de langues choisi utilise le niveau CECRL (A1 à C2) : indique-le pour chaque langue, sinon sa jauge reste vide.',
      target: { section: 'languages' },
    })
  }

  // --- Template
  const note =
    template.atsNote ??
    (isTwoColumnLayout(resolved.layout)
      ? 'Ta mise en page a deux colonnes : certains logiciels de recrutement (ATS) les lisent dans le désordre. Préfère une colonne pour les candidatures en ligne.'
      : null)
  if (note) add({ id: 'template-ats', level: 'info', message: note })

  const rank: Record<CvCheckLevel, number> = { error: 0, warning: 1, info: 2 }
  return checks.sort((a, b) => rank[a.level] - rank[b.level])
}
