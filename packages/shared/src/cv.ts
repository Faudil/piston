import * as z from 'zod'

/**
 * The structured CV document edited in the CV builder (« Créer mon CV »).
 *
 * Stored as JSON in `cv_documents.content`, rendered to PDF by
 * `@piston/cv-render` (in the browser for the preview, on the server for
 * exports), and edited by Claude through typed operations (cv-operations.ts)
 * that target the ids below. See docs/design/cv-builder.md and
 * docs/design/cv-builder-v2.md.
 *
 * Schema version 2. Every v1 document still parses: `CvContent` runs
 * `upgradeCvContent` before validating, so stored documents are upgraded on
 * read and rewritten as v2 on their next save.
 */

/** Current version of the document schema (`content.version`). */
export const CV_SCHEMA_VERSION = 2

/** Size limits of a CV document. Generous for a resume, small enough for a prompt. */
export const CV_LIMITS = {
  documentTitle: 120,
  shortText: 120,
  phone: 40,
  location: 80,
  date: 20,
  url: 300,
  linkLabel: 60,
  summary: 1500,
  bullet: 400,
  details: 600,
  skillItem: 60,
  sectionTitle: 60,
  extraLine: 200,
  customText: 600,
  links: 5,
  bullets: 12,
  skillItems: 30,
  experiences: 20,
  education: 10,
  skills: 10,
  languages: 10,
  projects: 10,
  certifications: 15,
  interests: 10,
  volunteering: 10,
  awards: 10,
  publications: 15,
  references: 6,
  extras: 15,
  customSections: 6,
  customItems: 15,
} as const

/** Item and bullet ids: short random strings, so Claude can quote them reliably. */
export const CvId = z.string().regex(/^[a-z0-9]{1,24}$/, 'Identifiant invalide.')

/** A new random id (8 base-36 characters). Works in the browser, Bun and Node. */
export function newCvId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join('')
}

const text = (max: number) => z.string().max(max).default('')

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const CvBullet = z.object({ id: CvId, text: text(CV_LIMITS.bullet) })
export type CvBullet = z.infer<typeof CvBullet>

const bullets = z.array(CvBullet).max(CV_LIMITS.bullets).default([])

export const CvLink = z.object({
  id: CvId,
  label: text(CV_LIMITS.linkLabel),
  url: text(CV_LIMITS.url),
})
export type CvLink = z.infer<typeof CvLink>

// --- Photo ---------------------------------------------------------------------

export const cvPhotoShapes = ['round', 'rounded', 'square'] as const
export const cvPhotoSizes = ['s', 'm', 'l'] as const
export const cvPhotoPositions = ['left', 'right', 'center'] as const

/**
 * The header photo: a reference to a row of `cv_document_assets` (the bytes
 * never live in the document) and how to show it. Rendering needs the image
 * as a data URL in the renderer's `assets`; without it, no photo is drawn.
 */
export const CvPhoto = z.object({
  assetId: z.uuid(),
  shape: z.enum(cvPhotoShapes).default('round'),
  size: z.enum(cvPhotoSizes).default('m'),
  position: z.enum(cvPhotoPositions).default('left'),
  visible: z.boolean().default(true),
})
export type CvPhoto = z.infer<typeof CvPhoto>

export const CvHeader = z.object({
  fullName: text(CV_LIMITS.shortText),
  /** Target job title shown under the name (« Chargée de communication »). */
  title: text(CV_LIMITS.shortText),
  email: text(CV_LIMITS.shortText),
  phone: text(CV_LIMITS.phone),
  city: text(CV_LIMITS.location),
  links: z.array(CvLink).max(CV_LIMITS.links).default([]),
  photo: CvPhoto.nullable().default(null),
})
export type CvHeader = z.infer<typeof CvHeader>

// --- Items ---------------------------------------------------------------------------

/**
 * Dates are free strings (« 03/2021 », « 2021 », « Aujourd'hui »): only their
 * length is bounded here, the format is a live check (cv-checks.ts), so an
 * autosave never rejects a half-typed date.
 */
const date = text(CV_LIMITS.date)

const experienceShape = {
  id: CvId,
  title: text(CV_LIMITS.shortText),
  organization: text(CV_LIMITS.shortText),
  location: text(CV_LIMITS.location),
  start: date,
  end: date,
  bullets,
}

export const CvExperience = z.object(experienceShape)
export type CvExperience = z.infer<typeof CvExperience>

/** Volunteering has the shape of an experience (role, organization, dates, bullets). */
export const CvVolunteering = z.object(experienceShape)
export type CvVolunteering = z.infer<typeof CvVolunteering>

export const CvEducation = z.object({
  id: CvId,
  degree: text(CV_LIMITS.shortText),
  school: text(CV_LIMITS.shortText),
  location: text(CV_LIMITS.location),
  start: date,
  end: date,
  details: text(CV_LIMITS.details),
})
export type CvEducation = z.infer<typeof CvEducation>

/** Skill levels: 0 = no level shown, 1 to 5 = dots or bar in the templates that show them. */
export const CV_SKILL_MAX_LEVEL = 5

export const CvSkill = z.object({
  id: CvId,
  name: z.string().max(CV_LIMITS.skillItem),
  level: z.number().int().min(0).max(CV_SKILL_MAX_LEVEL).default(0),
})
export type CvSkill = z.infer<typeof CvSkill>

/**
 * Id of the skill at `index` of a v1 group, whose skills were plain strings.
 * Deterministic, so upgrading the same stored document twice (two reads, or
 * the server and the browser) gives the same ids, and an AI proposal made on
 * one read still applies to the other.
 */
export function upgradedSkillId(groupId: string, index: number): string {
  return `${groupId.slice(0, 20)}k${index}`
}

export const CvSkillGroup = z.preprocess(
  (raw) => {
    // v1 skills were strings: give them a deterministic id and no level.
    if (!isRecord(raw) || !Array.isArray(raw.items) || typeof raw.id !== 'string') return raw
    if (!raw.items.some((item) => typeof item === 'string')) return raw
    return {
      ...raw,
      items: raw.items.map((item, index) =>
        typeof item === 'string'
          ? { id: upgradedSkillId(raw.id as string, index), name: item, level: 0 }
          : item,
      ),
    }
  },
  z.object({
    id: CvId,
    name: text(CV_LIMITS.shortText),
    items: z.array(CvSkill).max(CV_LIMITS.skillItems).default([]),
  }),
)
export type CvSkillGroup = z.infer<typeof CvSkillGroup>

/** CEFR levels (« CECRL » in French), plus « natif » for a mother tongue. */
export const cvCefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'natif'] as const
export const CvCefr = z.enum(cvCefrLevels)
export type CvCefr = z.infer<typeof CvCefr>

export const cvCefrLabels: Record<CvCefr, string> = {
  A1: 'A1 · Débutant',
  A2: 'A2 · Élémentaire',
  B1: 'B1 · Intermédiaire',
  B2: 'B2 · Avancé',
  C1: 'C1 · Autonome',
  C2: 'C2 · Maîtrise',
  natif: 'Langue maternelle',
}

/** Position of a CEFR level on a 0–1 scale, for bars and dots (null: no level). */
export function cvCefrRatio(cefr: CvCefr | null): number | null {
  if (cefr === null) return null
  return cefr === 'natif' ? 1 : (cvCefrLevels.indexOf(cefr) + 1) / 6
}

/**
 * The CEFR level written in a free-text level (« C1 », « courant (B2) »,
 * « Langue maternelle »), or null. Used to upgrade v1 languages.
 */
export function inferCefr(level: unknown): CvCefr | null {
  if (typeof level !== 'string') return null
  const match = /\b([ABC][12])\b/i.exec(level)
  if (match) return match[1]!.toUpperCase() as CvCefr
  if (/maternelle|natif|native|bilingue|mother tongue/i.test(level)) return 'natif'
  return null
}

export const CvLanguage = z.object({
  id: CvId,
  name: text(CV_LIMITS.shortText),
  /** Free text: « C1 », « Courant », « Langue maternelle »... Shown as is when set. */
  level: text(CV_LIMITS.shortText),
  /** Structured level, for the templates that draw bars or dots. */
  cefr: CvCefr.nullable().default(null),
})
export type CvLanguage = z.infer<typeof CvLanguage>

export const CvProject = z.object({
  id: CvId,
  name: text(CV_LIMITS.shortText),
  role: text(CV_LIMITS.shortText),
  url: text(CV_LIMITS.url),
  start: date,
  end: date,
  bullets,
})
export type CvProject = z.infer<typeof CvProject>

export const CvCertification = z.object({
  id: CvId,
  name: text(CV_LIMITS.shortText),
  issuer: text(CV_LIMITS.shortText),
  date,
  url: text(CV_LIMITS.url),
})
export type CvCertification = z.infer<typeof CvCertification>

export const CvInterest = z.object({
  id: CvId,
  name: text(CV_LIMITS.shortText),
  details: text(CV_LIMITS.details),
})
export type CvInterest = z.infer<typeof CvInterest>

export const CvAward = z.object({
  id: CvId,
  name: text(CV_LIMITS.shortText),
  issuer: text(CV_LIMITS.shortText),
  date,
  details: text(CV_LIMITS.details),
})
export type CvAward = z.infer<typeof CvAward>

export const CvPublication = z.object({
  id: CvId,
  title: text(CV_LIMITS.shortText),
  /** Journal, publisher, conference, blog... */
  publisher: text(CV_LIMITS.shortText),
  date,
  url: text(CV_LIMITS.url),
})
export type CvPublication = z.infer<typeof CvPublication>

export const CvReference = z.object({
  id: CvId,
  name: text(CV_LIMITS.shortText),
  role: text(CV_LIMITS.shortText),
  organization: text(CV_LIMITS.shortText),
  /** E-mail or phone, as the user wants it printed. */
  contact: text(CV_LIMITS.shortText),
})
export type CvReference = z.infer<typeof CvReference>

/** A free line of the « Informations complémentaires » section (« Permis B », « Mobilité »). */
export const CvExtra = z.object({ id: CvId, text: text(CV_LIMITS.extraLine) })
export type CvExtra = z.infer<typeof CvExtra>

// --- Custom sections -------------------------------------------------------------------

export const CvCustomItem = z.object({
  id: CvId,
  title: text(CV_LIMITS.shortText),
  subtitle: text(CV_LIMITS.shortText),
  date,
  text: text(CV_LIMITS.customText),
})
export type CvCustomItem = z.infer<typeof CvCustomItem>

/** A section the user named themselves (« Expositions », « Associations »...). */
export const CvCustomSection = z.object({
  id: CvId,
  /** The section's title; the `sections` entry of a custom section has no title of its own. */
  title: text(CV_LIMITS.sectionTitle),
  items: z.array(CvCustomItem).max(CV_LIMITS.customItems).default([]),
})
export type CvCustomSection = z.infer<typeof CvCustomSection>

/** The text fields of a custom item, in display order. */
export const cvCustomItemFields = ['title', 'subtitle', 'date', 'text'] as const
export type CvCustomItemField = (typeof cvCustomItemFields)[number]

export const cvCustomItemFieldLabels: Record<CvCustomItemField, string> = {
  title: 'Titre',
  subtitle: 'Sous-titre',
  date: 'Date',
  text: 'Texte',
}

export function cvCustomFieldMaxLength(field: CvCustomItemField): number {
  if (field === 'date') return CV_LIMITS.date
  if (field === 'text') return CV_LIMITS.customText
  return CV_LIMITS.shortText
}

// --- Sections ----------------------------------------------------------------

/** Every built-in section of a CV, in their default order. The header is always first and is not a section. */
export const cvSectionKeys = [
  'summary',
  'experiences',
  'education',
  'skills',
  'languages',
  'projects',
  'certifications',
  'interests',
  'volunteering',
  'awards',
  'publications',
  'references',
  'extras',
] as const
export const CvSectionKey = z.enum(cvSectionKeys)
export type CvSectionKey = z.infer<typeof CvSectionKey>

/**
 * The sections shown in a new document. The others (added in v2) start
 * hidden, so upgraded and blank documents do not list five empty sections;
 * the editor offers them as « Ajouter une section ».
 */
export const cvDefaultVisibleSections: ReadonlySet<CvSectionKey> = new Set([
  'summary',
  'experiences',
  'education',
  'skills',
  'languages',
  'projects',
  'certifications',
  'interests',
])

/** The sections that hold a list of items (all but the summary). */
export const cvListSectionKeys = [
  'experiences',
  'education',
  'skills',
  'languages',
  'projects',
  'certifications',
  'interests',
  'volunteering',
  'awards',
  'publications',
  'references',
  'extras',
] as const
export const CvListSectionKey = z.enum(cvListSectionKeys)
export type CvListSectionKey = z.infer<typeof CvListSectionKey>

/** The sections whose items have bullets. */
export const cvBulletSectionKeys = ['experiences', 'projects', 'volunteering'] as const
export const CvBulletSectionKey = z.enum(cvBulletSectionKeys)
export type CvBulletSectionKey = z.infer<typeof CvBulletSectionKey>

/** Item type of each list section. */
export interface CvSectionItems {
  experiences: CvExperience
  education: CvEducation
  skills: CvSkillGroup
  languages: CvLanguage
  projects: CvProject
  certifications: CvCertification
  interests: CvInterest
  volunteering: CvVolunteering
  awards: CvAward
  publications: CvPublication
  references: CvReference
  extras: CvExtra
}
export type CvItem = CvSectionItems[CvListSectionKey]

/** The editable text fields of each item type (lists such as bullets and skills are separate). */
export const cvItemTextFields = {
  experiences: ['title', 'organization', 'location', 'start', 'end'],
  education: ['degree', 'school', 'location', 'start', 'end', 'details'],
  skills: ['name'],
  languages: ['name', 'level'],
  projects: ['name', 'role', 'url', 'start', 'end'],
  certifications: ['name', 'issuer', 'date', 'url'],
  interests: ['name', 'details'],
  volunteering: ['title', 'organization', 'location', 'start', 'end'],
  awards: ['name', 'issuer', 'date', 'details'],
  publications: ['title', 'publisher', 'date', 'url'],
  references: ['name', 'role', 'organization', 'contact'],
  extras: ['text'],
} as const satisfies { [K in CvListSectionKey]: ReadonlyArray<keyof CvSectionItems[K] & string> }
export type CvItemTextField<K extends CvListSectionKey = CvListSectionKey> =
  (typeof cvItemTextFields)[K][number]

/** Maximum length of an item text field, by field name. */
export function cvFieldMaxLength(field: string): number {
  if (field === 'location') return CV_LIMITS.location
  if (field === 'start' || field === 'end' || field === 'date') return CV_LIMITS.date
  if (field === 'url') return CV_LIMITS.url
  if (field === 'details') return CV_LIMITS.details
  if (field === 'text') return CV_LIMITS.extraLine
  return CV_LIMITS.shortText
}

/** Maximum number of items per list section. */
export const cvSectionMaxItems: Record<CvListSectionKey, number> = {
  experiences: CV_LIMITS.experiences,
  education: CV_LIMITS.education,
  skills: CV_LIMITS.skills,
  languages: CV_LIMITS.languages,
  projects: CV_LIMITS.projects,
  certifications: CV_LIMITS.certifications,
  interests: CV_LIMITS.interests,
  volunteering: CV_LIMITS.volunteering,
  awards: CV_LIMITS.awards,
  publications: CV_LIMITS.publications,
  references: CV_LIMITS.references,
  extras: CV_LIMITS.extras,
}

/**
 * Where a section goes in two-column layouts: `auto` lets the template
 * decide (its `sideSections`), `main` and `side` are the user's choice.
 * Single-column layouts ignore it.
 */
export const cvSectionColumns = ['auto', 'main', 'side'] as const
export const CvSectionColumn = z.enum(cvSectionColumns)
export type CvSectionColumn = z.infer<typeof CvSectionColumn>

const sectionSettings = {
  /** Custom title; empty = the default title in the document's language. Always empty for custom sections. */
  title: text(CV_LIMITS.sectionTitle),
  visible: z.boolean().default(true),
  column: CvSectionColumn.default('auto'),
}

export const CvBuiltinSectionConfig = z.object({ key: CvSectionKey, ...sectionSettings })
export type CvBuiltinSectionConfig = z.infer<typeof CvBuiltinSectionConfig>

export const CvCustomSectionConfig = z.object({
  key: z.literal('custom'),
  /** Id of the section in `content.custom`. */
  customId: CvId,
  ...sectionSettings,
})
export type CvCustomSectionConfig = z.infer<typeof CvCustomSectionConfig>

/** One entry of `content.sections`: order, visibility, title and column of a section. */
export const CvSectionConfig = z.discriminatedUnion('key', [
  CvBuiltinSectionConfig,
  CvCustomSectionConfig,
])
export type CvSectionConfig = z.infer<typeof CvSectionConfig>

/**
 * A stable string for a section entry: its key, or `custom:<id>`. Used for
 * DOM ids, Vue keys, live-check targets and the renderer's content ids.
 */
export function cvSectionRef(section: CvSectionConfig): string {
  return section.key === 'custom' ? `custom:${section.customId}` : section.key
}

/**
 * Makes the section list consistent with the document: each built-in key
 * exactly once (duplicates dropped, missing keys appended in their default
 * order, visible only for the v1 sections), one entry per existing custom
 * section (entries of deleted ones dropped, new ones appended visible).
 */
export function normalizeSections(
  sections: CvSectionConfig[],
  customIds: readonly string[] = [],
): CvSectionConfig[] {
  const seen = new Set<string>()
  const custom = new Set(customIds)
  const result: CvSectionConfig[] = []
  for (const section of sections) {
    const ref = cvSectionRef(section)
    if (seen.has(ref)) continue
    if (section.key === 'custom') {
      if (!custom.has(section.customId)) continue
      seen.add(ref)
      result.push({ ...section, title: '' })
      continue
    }
    seen.add(ref)
    result.push(section)
  }
  for (const key of cvSectionKeys) {
    if (!seen.has(key)) {
      result.push({ key, title: '', visible: cvDefaultVisibleSections.has(key), column: 'auto' })
    }
  }
  for (const customId of customIds) {
    if (!seen.has(`custom:${customId}`)) {
      seen.add(`custom:${customId}`)
      result.push({ key: 'custom', customId, title: '', visible: true, column: 'auto' })
    }
  }
  return result
}

// --- The document --------------------------------------------------------------------

/**
 * Upgrades a stored or received document to the current schema, before
 * validation. Pure, idempotent (a v2 document is returned unchanged) and
 * deterministic: no random id, so two reads of a v1 document upgrade to the
 * same v2 document.
 *
 * v1 → v2: `version: 2`; languages get a `cefr` inferred from their free
 * level (« C1 », « langue maternelle »). Everything else is a default of the
 * v2 schema: skills strings become `{ id, name, level: 0 }` (see
 * `CvSkillGroup`), the new sections are appended hidden by
 * `normalizeSections`, `photo` is null, `custom` is empty.
 */
export function upgradeCvContent(raw: unknown): unknown {
  if (!isRecord(raw)) return raw
  if (raw.version === CV_SCHEMA_VERSION) return raw
  // An unknown future version is left for the schema to reject.
  if (raw.version !== undefined && raw.version !== 1) return raw
  const next: Record<string, unknown> = { ...raw, version: CV_SCHEMA_VERSION }
  if (Array.isArray(raw.languages)) {
    next.languages = raw.languages.map((language) =>
      isRecord(language) && language.cefr === undefined
        ? { ...language, cefr: inferCefr(language.level) }
        : language,
    )
  }
  return next
}

const CvContentObject = z
  .object({
    version: z.literal(CV_SCHEMA_VERSION).default(CV_SCHEMA_VERSION),
    header: CvHeader.default({
      fullName: '',
      title: '',
      email: '',
      phone: '',
      city: '',
      links: [],
      photo: null,
    }),
    summary: text(CV_LIMITS.summary),
    experiences: z.array(CvExperience).max(CV_LIMITS.experiences).default([]),
    education: z.array(CvEducation).max(CV_LIMITS.education).default([]),
    skills: z.array(CvSkillGroup).max(CV_LIMITS.skills).default([]),
    languages: z.array(CvLanguage).max(CV_LIMITS.languages).default([]),
    projects: z.array(CvProject).max(CV_LIMITS.projects).default([]),
    certifications: z.array(CvCertification).max(CV_LIMITS.certifications).default([]),
    interests: z.array(CvInterest).max(CV_LIMITS.interests).default([]),
    volunteering: z.array(CvVolunteering).max(CV_LIMITS.volunteering).default([]),
    awards: z.array(CvAward).max(CV_LIMITS.awards).default([]),
    publications: z.array(CvPublication).max(CV_LIMITS.publications).default([]),
    references: z.array(CvReference).max(CV_LIMITS.references).default([]),
    /** « Références disponibles sur demande »: printed instead of the reference list. */
    referencesAvailableOnRequest: z.boolean().default(false),
    extras: z.array(CvExtra).max(CV_LIMITS.extras).default([]),
    custom: z.array(CvCustomSection).max(CV_LIMITS.customSections).default([]),
    sections: z.array(CvSectionConfig).max(40).default([]),
  })
  .transform((content) => ({
    ...content,
    sections: normalizeSections(
      content.sections,
      content.custom.map((section) => section.id),
    ),
  }))

/** The document schema (v2). Accepts v1 documents, upgraded by `upgradeCvContent`. */
export const CvContent = z.preprocess(upgradeCvContent, CvContentObject)
export type CvContent = z.infer<typeof CvContentObject>

/** A document with the user's name and the default sections visible and empty. */
export function createBlankCv(fullName = ''): CvContent {
  return CvContent.parse({ header: { fullName } })
}

/** Turns loose skill values (strings or `{ name, level }`) into skills with fresh ids. */
function skillsFrom(raw: unknown): CvSkill[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      const name = typeof entry === 'string' ? entry : isRecord(entry) ? entry.name : undefined
      const level = isRecord(entry) && typeof entry.level === 'number' ? entry.level : 0
      return { name, level }
    })
    .filter(
      (entry): entry is { name: string; level: number } =>
        typeof entry.name === 'string' && entry.name.trim() !== '',
    )
    .slice(0, CV_LIMITS.skillItems)
    .map((entry) => ({
      id: newCvId(),
      name: entry.name.slice(0, CV_LIMITS.skillItem),
      level: Math.min(CV_SKILL_MAX_LEVEL, Math.max(0, Math.round(entry.level))),
    }))
}

/**
 * A new item of `section` with a fresh id, its fields taken from `values`
 * when they are strings (cut to their maximum length), empty otherwise.
 * Used by the editor's « Ajouter » buttons, by drafts and by `add_item`.
 */
export function createCvItem<K extends CvListSectionKey>(
  section: K,
  values: Record<string, unknown> = {},
): CvSectionItems[K] {
  const item: Record<string, unknown> = { id: newCvId() }
  for (const field of cvItemTextFields[section]) {
    const value = values[field]
    item[field] = typeof value === 'string' ? value.slice(0, cvFieldMaxLength(field)) : ''
  }
  if ((cvBulletSectionKeys as readonly string[]).includes(section)) {
    const raw = Array.isArray(values.bullets) ? values.bullets : []
    item.bullets = raw
      .map((entry) => (typeof entry === 'string' ? entry : (entry as { text?: unknown })?.text))
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      .slice(0, CV_LIMITS.bullets)
      .map((entry) => ({ id: newCvId(), text: entry.slice(0, CV_LIMITS.bullet) }))
  }
  if (section === 'skills') item.items = skillsFrom(values.items)
  if (section === 'languages') {
    const cefr = CvCefr.safeParse(values.cefr)
    item.cefr = cefr.success ? cefr.data : inferCefr(item.level)
  }
  return item as unknown as CvSectionItems[K]
}

/** A new custom item with a fresh id, fields cut to their limits. */
export function createCvCustomItem(values: Record<string, unknown> = {}): CvCustomItem {
  const item: Record<string, unknown> = { id: newCvId() }
  for (const field of cvCustomItemFields) {
    const value = values[field]
    item[field] = typeof value === 'string' ? value.slice(0, cvCustomFieldMaxLength(field)) : ''
  }
  return item as unknown as CvCustomItem
}

/** A new custom section with a fresh id. Its `sections` entry is added by `normalizeSections`. */
export function createCvCustomSection(
  title: string,
  items: Array<Record<string, unknown>> = [],
): CvCustomSection {
  return {
    id: newCvId(),
    title: title.slice(0, CV_LIMITS.sectionTitle),
    items: items.slice(0, CV_LIMITS.customItems).map(createCvCustomItem),
  }
}

// --- Labels ---------------------------------------------------------------------------

export const cvLanguages = ['fr', 'en'] as const
export const CvLanguageCode = z.enum(cvLanguages)
export type CvLanguageCode = z.infer<typeof CvLanguageCode>

export const cvLanguageLabels: Record<CvLanguageCode, string> = {
  fr: 'Français',
  en: 'Anglais',
}

/** Default section titles, per language of the document. */
export const cvSectionTitles: Record<CvLanguageCode, Record<CvSectionKey, string>> = {
  fr: {
    summary: 'Profil',
    experiences: 'Expérience professionnelle',
    education: 'Formation',
    skills: 'Compétences',
    languages: 'Langues',
    projects: 'Projets',
    certifications: 'Certifications',
    interests: "Centres d'intérêt",
    volunteering: 'Bénévolat',
    awards: 'Prix et distinctions',
    publications: 'Publications',
    references: 'Références',
    extras: 'Informations complémentaires',
  },
  en: {
    summary: 'Profile',
    experiences: 'Professional experience',
    education: 'Education',
    skills: 'Skills',
    languages: 'Languages',
    projects: 'Projects',
    certifications: 'Certifications',
    interests: 'Interests',
    volunteering: 'Volunteering',
    awards: 'Awards',
    publications: 'Publications',
    references: 'References',
    extras: 'Additional information',
  },
}

/** « Références disponibles sur demande », per language. */
export const cvReferencesOnRequestText: Record<CvLanguageCode, string> = {
  fr: 'Références disponibles sur demande',
  en: 'References available upon request',
}

/**
 * The title shown for a section: its custom title, else the default one.
 * Custom sections take the title of their `content.custom` entry, so pass
 * `custom` for them (« Section personnalisée » otherwise).
 */
export function cvSectionTitle(
  section: CvSectionConfig,
  language: CvLanguageCode,
  custom: readonly CvCustomSection[] = [],
): string {
  if (section.key === 'custom') {
    const found = custom.find((entry) => entry.id === section.customId)
    return found?.title.trim() || (language === 'fr' ? 'Section personnalisée' : 'Section')
  }
  return section.title.trim() || cvSectionTitles[language][section.key]
}

/** French labels of item fields, for the editor and the proposal review. */
export const cvFieldLabels: { [K in CvListSectionKey]: Record<CvItemTextField<K>, string> } = {
  experiences: {
    title: 'Intitulé du poste',
    organization: 'Entreprise ou organisation',
    location: 'Lieu',
    start: 'Début',
    end: 'Fin',
  },
  education: {
    degree: 'Diplôme',
    school: 'École ou université',
    location: 'Lieu',
    start: 'Début',
    end: 'Fin',
    details: 'Détails',
  },
  skills: { name: 'Groupe' },
  languages: { name: 'Langue', level: 'Niveau' },
  projects: { name: 'Nom du projet', role: 'Rôle', url: 'Lien', start: 'Début', end: 'Fin' },
  certifications: { name: 'Certification', issuer: 'Organisme', date: 'Date', url: 'Lien' },
  interests: { name: "Centre d'intérêt", details: 'Détails' },
  volunteering: {
    title: 'Rôle',
    organization: 'Association ou organisation',
    location: 'Lieu',
    start: 'Début',
    end: 'Fin',
  },
  awards: { name: 'Prix ou distinction', issuer: 'Décerné par', date: 'Date', details: 'Détails' },
  publications: { title: 'Titre', publisher: 'Revue, éditeur ou média', date: 'Date', url: 'Lien' },
  references: {
    name: 'Nom',
    role: 'Fonction',
    organization: 'Entreprise ou organisation',
    contact: 'Contact (e-mail ou téléphone)',
  },
  extras: { text: 'Information' },
}

export const cvHeaderFields = ['fullName', 'title', 'email', 'phone', 'city'] as const
export const CvHeaderField = z.enum(cvHeaderFields)
export type CvHeaderField = z.infer<typeof CvHeaderField>

export const cvHeaderFieldLabels: Record<CvHeaderField, string> = {
  fullName: 'Nom complet',
  title: 'Titre visé',
  email: 'E-mail',
  phone: 'Téléphone',
  city: 'Ville',
}

/** One-line name of an item, for lists and the proposal review (« Chargée de com · Agence X »). */
export function cvItemLabel(section: CvListSectionKey, item: CvItem): string {
  const record = item as unknown as Record<string, string>
  const parts =
    section === 'experiences' || section === 'volunteering'
      ? [record.title, record.organization]
      : section === 'education'
        ? [record.degree, record.school]
        : section === 'publications'
          ? [record.title]
          : section === 'extras'
            ? [record.text]
            : [record.name]
  const label = parts.filter((part) => part?.trim()).join(' · ')
  return label || 'Sans titre'
}
