import {
  cvSectionTitle,
  type CvContent,
  type CvDesign,
  type CvLanguageCode,
  type CvSectionConfig,
  type CvSectionKey,
} from './cv'

/**
 * Plain-text views of a CV document: date formatting shared with the PDF
 * templates, and the .txt / .md exports.
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

/** True when a section has nothing to show. */
export function isCvSectionEmpty(content: CvContent, key: CvSectionKey): boolean {
  if (key === 'summary') return !content.summary.trim()
  return content[key].length === 0
}

/** The sections to render, in order: visible and not empty. */
export function renderedCvSections(content: CvContent): CvSectionConfig[] {
  return content.sections.filter(
    (section) => section.visible && !isCvSectionEmpty(content, section.key),
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
function sectionBlocks(content: CvContent, key: CvSectionKey, language: CvLanguageCode): Block[] {
  const range = (start: string, end: string) => formatCvDateRange(start, end, language)
  switch (key) {
    case 'summary':
      return [{ heading: '', meta: '', lines: [content.summary.trim()] }]
    case 'experiences':
      return content.experiences.map((item) => ({
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
      return content.skills.map((group) => ({
        heading: '',
        meta: '',
        lines: [joinTruthy([group.name, group.items.join(', ')], ' : ')],
      }))
    case 'languages':
      return [
        {
          heading: '',
          meta: '',
          lines: content.languages.map((item) => joinTruthy([item.name, item.level], ' : ')),
        },
      ]
    case 'projects':
      return content.projects.map((item) => ({
        heading: joinTruthy([item.name, item.role], ' — '),
        meta: joinTruthy([range(item.start, item.end), item.url], ' · '),
        lines: item.bullets.map((bullet) => bullet.text.trim()).filter(Boolean),
      }))
    case 'certifications':
      return content.certifications.map((item) => ({
        heading: '',
        meta: '',
        lines: [joinTruthy([item.name, item.issuer, item.date, item.url], ' · ')],
      }))
    case 'interests':
      return content.interests.map((item) => ({
        heading: '',
        meta: '',
        lines: [joinTruthy([item.name, item.details], ' : ')],
      }))
  }
}

/** The CV as plain text, in the order and with the titles of the PDF. */
export function cvToText(content: CvContent, design: Pick<CvDesign, 'language'>): string {
  const out: string[] = []
  out.push(content.header.fullName.trim(), content.header.title.trim())
  out.push(cvContactParts(content).join(' · '))
  for (const section of renderedCvSections(content)) {
    out.push('', cvSectionTitle(section, design.language).toUpperCase())
    const blocks = sectionBlocks(content, section.key, design.language)
    const bulleted = section.key === 'experiences' || section.key === 'projects'
    for (const block of blocks) {
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
export function cvToMarkdown(content: CvContent, design: Pick<CvDesign, 'language'>): string {
  const out: string[] = []
  if (content.header.fullName.trim()) out.push(`# ${content.header.fullName.trim()}`, '')
  if (content.header.title.trim()) out.push(`**${content.header.title.trim()}**`, '')
  const contact = cvContactParts(content)
  if (contact.length) out.push(contact.join(' · '), '')
  for (const section of renderedCvSections(content)) {
    out.push(`## ${cvSectionTitle(section, design.language)}`, '')
    const bulleted = section.key === 'experiences' || section.key === 'projects'
    for (const block of sectionBlocks(content, section.key, design.language)) {
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
