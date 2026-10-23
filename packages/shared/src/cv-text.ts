import {
  cvReferencesOnRequestText,
  cvSectionTitle,
  type CvContent,
  type CvCustomSection,
  type CvLanguage,
  type CvLanguageCode,
  type CvSectionConfig,
  type CvSectionKey,
} from './cv'

/**
 * Plain-text views of a CV document: date formatting shared with the PDF
 * renderer, and the .txt / .md exports.
 */

const PRESENT_WORDS = [
  "aujourd'hui",
  'aujourd’hui',
  'présent',
  'present',
  'en cours',
  'actuel',
  'now',
]

/** True for an end date meaning "still in this position" (« Aujourd'hui », « Present »...). */
export function isPresentDate(value: string): boolean {
  return PRESENT_WORDS.includes(value.trim().toLowerCase())
}

const PRESENT_LABEL: Record<CvLanguageCode, string> = { fr: "Aujourd'hui", en: 'Present' }

/** « 03/2021 – Aujourd'hui », « 2019 – 2021 », « 2020 », or '' when both are empty. */
export function formatCvDateRange(start: string, end: string, language: CvLanguageCode): string {
  const from = start.trim()
  const to = isPresentDate(end) ? PRESENT_LABEL[language] : end.trim()
  if (from && to) return from === to ? from : `${from} – ${to}`
  return from || to
}

const NATIVE_LABEL: Record<CvLanguageCode, string> = { fr: 'Langue maternelle', en: 'Native' }

/** The level printed for a language: its free text, else its CEFR level (« C1 », « Langue maternelle »). */
export function cvLanguageLevelText(
  language: CvLanguage,
  documentLanguage: CvLanguageCode,
): string {
  const level = language.level.trim()
  if (level) return level
  if (language.cefr === 'natif') return NATIVE_LABEL[documentLanguage]
  return language.cefr ?? ''
}

/** The custom section of a `custom` section entry. */
export function findCvCustomSection(
  content: CvContent,
  section: CvSectionConfig,
): CvCustomSection | undefined {
  return section.key === 'custom'
    ? content.custom.find((entry) => entry.id === section.customId)
    : undefined
}

/** True when a section has nothing to show. Accepts a section entry or a built-in key. */
export function isCvSectionEmpty(
  content: CvContent,
  section: CvSectionConfig | CvSectionKey,
): boolean {
  const entry: CvSectionConfig =
    typeof section === 'string'
      ? { key: section, title: '', visible: true, column: 'auto' }
      : section
  if (entry.key === 'custom') return !findCvCustomSection(content, entry)?.items.length
  if (entry.key === 'summary') return !content.summary.trim()
  if (entry.key === 'references')
    return content.references.length === 0 && !content.referencesAvailableOnRequest
  return content[entry.key].length === 0
}

/** The sections to render, in order: visible and not empty. */
export function renderedCvSections(content: CvContent): CvSectionConfig[] {
  return content.sections.filter(
    (section) => section.visible && !isCvSectionEmpty(content, section),
  )
}

/** « e-mail · téléphone · ville · LinkedIn: url », the contact line under the title. */
export function cvContactParts(content: CvContent): string[] {
  const { email, phone, city, links } = content.header
  return [
    email,
    phone,
    city,
    ...links.map((link) => (link.label.trim() ? `${link.label.trim()} : ${link.url}` : link.url)),
  ]
    .map((part) => part.trim())
    .filter(Boolean)
}

const joinTruthy = (parts: string[], separator: string) =>
  parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(separator)

interface Block {
  heading: string
  meta: string
  lines: string[]
}

/** Each rendered section as a title and blocks, the common ground of the text formats. */
function sectionBlocks(
  content: CvContent,
  section: CvSectionConfig,
  language: CvLanguageCode,
): Block[] {
  const range = (start: string, end: string) => formatCvDateRange(start, end, language)
  const line = (value: string): Block => ({ heading: '', meta: '', lines: [value] })
  if (section.key === 'custom') {
    return (findCvCustomSection(content, section)?.items ?? []).map((item) => ({
      heading: joinTruthy([item.title, item.subtitle], ' — '),
      meta: item.date.trim(),
      lines: item.text.trim() ? [item.text.trim()] : [],
    }))
  }
  switch (section.key) {
    case 'summary':
      return [line(content.summary.trim())]
    case 'experiences':
    case 'volunteering':
      return content[section.key].map((item) => ({
        heading: joinTruthy([item.title, item.organization], ' — '),
        meta: joinTruthy([range(item.start, item.end), item.location], ' · '),
        lines: item.bullets.map((bullet) => bullet.text.trim()).filter(Boolean),
      }))
    case 'education':
      return content.education.map((item) => ({
        heading: joinTruthy([item.degree, item.school], ' — '),
        meta: joinTruthy([range(item.start, item.end), item.location], ' · '),
        lines: item.details.trim() ? [item.details.trim()] : [],
      }))
    case 'skills':
      return content.skills.map((group) =>
        line(joinTruthy([group.name, group.items.map((skill) => skill.name).join(', ')], ' : ')),
      )
    case 'languages':
      return [
        {
          heading: '',
          meta: '',
          lines: content.languages.map((item) =>
            joinTruthy([item.name, cvLanguageLevelText(item, language)], ' : '),
          ),
        },
      ]
    case 'projects':
      return content.projects.map((item) => ({
        heading: joinTruthy([item.name, item.role], ' — '),
        meta: joinTruthy([range(item.start, item.end), item.url], ' · '),
        lines: item.bullets.map((bullet) => bullet.text.trim()).filter(Boolean),
      }))
    case 'certifications':
      return content.certifications.map((item) =>
        line(joinTruthy([item.name, item.issuer, item.date, item.url], ' · ')),
      )
    case 'interests':
      return content.interests.map((item) => line(joinTruthy([item.name, item.details], ' : ')))
    case 'awards':
      return content.awards.map((item) => ({
        heading: '',
        meta: '',
        lines: [
          joinTruthy([item.name, item.issuer, item.date], ' · '),
          ...(item.details.trim() ? [item.details.trim()] : []),
        ],
      }))
    case 'publications':
      return content.publications.map((item) =>
        line(joinTruthy([item.title, item.publisher, item.date, item.url], ' · ')),
      )
    case 'references':
      // « Disponibles sur demande » replaces the list: that is the point of the option.
      if (content.referencesAvailableOnRequest) return [line(cvReferencesOnRequestText[language])]
      return content.references.map((item) =>
        line(
          joinTruthy(
            [
              joinTruthy([item.name, joinTruthy([item.role, item.organization], ', ')], ' — '),
              item.contact,
            ],
            ' · ',
          ),
        ),
      )
    case 'extras':
      return [
        {
          heading: '',
          meta: '',
          lines: content.extras.map((item) => item.text.trim()).filter(Boolean),
        },
      ]
  }
}

const BULLETED = new Set<string>(['experiences', 'projects', 'volunteering'])

/** The CV as plain text, in the order and with the titles of the PDF. */
export function cvToText(content: CvContent, design: { language: CvLanguageCode }): string {
  const out: string[] = []
  out.push(content.header.fullName.trim(), content.header.title.trim())
  out.push(cvContactParts(content).join(' · '))
  for (const section of renderedCvSections(content)) {
    out.push('', cvSectionTitle(section, design.language, content.custom).toUpperCase())
    const bulleted = BULLETED.has(section.key)
    for (const block of sectionBlocks(content, section, design.language)) {
      if (block.heading) out.push(block.heading)
      if (block.meta) out.push(block.meta)
      out.push(...block.lines.map((line) => (bulleted ? `- ${line}` : line)))
    }
  }
  return `${out
    .filter((line, index) => line || index > 2)
    .join('\n')
    .trim()}\n`
}

/** Markdown export: `#` name, `##` sections, `###` items, `-` bullets. */
export function cvToMarkdown(content: CvContent, design: { language: CvLanguageCode }): string {
  const out: string[] = []
  if (content.header.fullName.trim()) out.push(`# ${content.header.fullName.trim()}`, '')
  if (content.header.title.trim()) out.push(`**${content.header.title.trim()}**`, '')
  const contact = cvContactParts(content)
  if (contact.length) out.push(contact.join(' · '), '')
  for (const section of renderedCvSections(content)) {
    out.push(`## ${cvSectionTitle(section, design.language, content.custom)}`, '')
    const bulleted = BULLETED.has(section.key)
    for (const block of sectionBlocks(content, section, design.language)) {
      if (block.heading) out.push(`### ${block.heading}`, '')
      if (block.meta) out.push(`*${block.meta}*`, '')
      if (block.lines.length) {
        out.push(
          ...block.lines.map((line) => (bulleted || block.lines.length > 1 ? `- ${line}` : line)),
          '',
        )
      }
    }
  }
  return `${out.join('\n').trim()}\n`
}

/** The rendered blocks of a section (heading, dates/place line, lines), shared with the Word export. */
export { sectionBlocks as cvSectionBlocks }
export type { Block as CvTextBlock }
