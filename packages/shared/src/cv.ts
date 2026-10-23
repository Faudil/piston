import * as z from 'zod'

/**
 * The structured CV document edited in the CV builder (« Créer mon CV »).
 *
 * Stored as JSON in `cv_documents.content`, rendered to PDF by the server
 * templates, and edited by Claude through typed operations (cv-operations.ts)
 * that target the ids below. See docs/design/cv-builder.md.
 */

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
} as const

/** Item and bullet ids: short random strings, so Claude can quote them reliably. */
export const CvId = z.string().regex(/^[a-z0-9]{1,24}$/, 'Identifiant invalide.')

/** A new random id (8 base-36 characters). Works in the browser, Bun and Node. */
export function newCvId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join('')
}

const text = (max: number) => z.string().max(max).default('')

export const CvBullet = z.object({ id: CvId, text: text(CV_LIMITS.bullet) })
export type CvBullet = z.infer<typeof CvBullet>

const bullets = z.array(CvBullet).max(CV_LIMITS.bullets).default([])

export const CvLink = z.object({
  id: CvId,
  label: text(CV_LIMITS.linkLabel),
  url: text(CV_LIMITS.url),
})
export type CvLink = z.infer<typeof CvLink>

export const CvHeader = z.object({
  fullName: text(CV_LIMITS.shortText),
  /** Target job title shown under the name (« Chargée de communication »). */
  title: text(CV_LIMITS.shortText),
  email: text(CV_LIMITS.shortText),
  phone: text(CV_LIMITS.phone),
  city: text(CV_LIMITS.location),
  links: z.array(CvLink).max(CV_LIMITS.links).default([]),
})
export type CvHeader = z.infer<typeof CvHeader>

/**
 * Dates are free strings (« 03/2021 », « 2021 », « Aujourd'hui »): only their
 * length is bounded here, the format is a live check (cv-checks.ts), so an
 * autosave never rejects a half-typed date.
 */
const date = text(CV_LIMITS.date)

export const CvExperience = z.object({
  id: CvId,
  title: text(CV_LIMITS.shortText),
  organization: text(CV_LIMITS.shortText),
  location: text(CV_LIMITS.location),
  start: date,
  end: date,
  bullets,
})
export type CvExperience = z.infer<typeof CvExperience>

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

export const CvSkillGroup = z.object({
  id: CvId,
  name: text(CV_LIMITS.shortText),
  items: z.array(z.string().max(CV_LIMITS.skillItem)).max(CV_LIMITS.skillItems).default([]),
})
export type CvSkillGroup = z.infer<typeof CvSkillGroup>

export const CvLanguage = z.object({
  id: CvId,
  name: text(CV_LIMITS.shortText),
  /** Free text: « C1 », « Courant », « Langue maternelle »... */
  level: text(CV_LIMITS.shortText),
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

// --- Sections ----------------------------------------------------------------

/** Every section of a CV, in their default order. The header is always first and is not a section. */
export const cvSectionKeys = [
  'summary',
  'experiences',
  'education',
  'skills',
  'languages',
  'projects',
  'certifications',
  'interests',
] as const
export const CvSectionKey = z.enum(cvSectionKeys)
export type CvSectionKey = z.infer<typeof CvSectionKey>

/** The sections that hold a list of items (all but the summary). */
export const cvListSectionKeys = [
  'experiences',
  'education',
  'skills',
  'languages',
  'projects',
  'certifications',
  'interests',
] as const
export const CvListSectionKey = z.enum(cvListSectionKeys)
export type CvListSectionKey = z.infer<typeof CvListSectionKey>

/** The sections whose items have bullets. */
export const cvBulletSectionKeys = ['experiences', 'projects'] as const
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
} as const satisfies { [K in CvListSectionKey]: ReadonlyArray<keyof CvSectionItems[K] & string> }
export type CvItemTextField<K extends CvListSectionKey = CvListSectionKey> =
  (typeof cvItemTextFields)[K][number]

/** Maximum length of an item text field, by field name. */
export function cvFieldMaxLength(field: string): number {
  if (field === 'location') return CV_LIMITS.location
  if (field === 'start' || field === 'end' || field === 'date') return CV_LIMITS.date
  if (field === 'url') return CV_LIMITS.url
  if (field === 'details') return CV_LIMITS.details
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
}

export const CvSectionConfig = z.object({
  key: CvSectionKey,
  /** Custom title; empty = the default title in the document's language. */
  title: text(60),
  visible: z.boolean().default(true),
})
export type CvSectionConfig = z.infer<typeof CvSectionConfig>

/**
 * Makes the section list contain each key exactly once: duplicates are
 * dropped, missing keys appended (visible) in their default order.
 */
export function normalizeSections(sections: CvSectionConfig[]): CvSectionConfig[] {
  const seen = new Set<CvSectionKey>()
  const result: CvSectionConfig[] = []
  for (const section of sections) {
    if (seen.has(section.key)) continue
    seen.add(section.key)
    result.push(section)
  }
  for (const key of cvSectionKeys) {
    if (!seen.has(key)) result.push({ key, title: '', visible: true })
  }
  return result
}

export const CvContent = z.object({
  header: CvHeader.default({
    fullName: '',
    title: '',
    email: '',
    phone: '',
    city: '',
    links: [],
  }),
  summary: text(CV_LIMITS.summary),
  experiences: z.array(CvExperience).max(CV_LIMITS.experiences).default([]),
  education: z.array(CvEducation).max(CV_LIMITS.education).default([]),
  skills: z.array(CvSkillGroup).max(CV_LIMITS.skills).default([]),
  languages: z.array(CvLanguage).max(CV_LIMITS.languages).default([]),
  projects: z.array(CvProject).max(CV_LIMITS.projects).default([]),
  certifications: z.array(CvCertification).max(CV_LIMITS.certifications).default([]),
  interests: z.array(CvInterest).max(CV_LIMITS.interests).default([]),
  sections: z.array(CvSectionConfig).max(16).default([]).transform(normalizeSections),
})
export type CvContent = z.infer<typeof CvContent>

/** A document with the user's name and every section visible and empty. */
export function createBlankCv(fullName = ''): CvContent {
  return CvContent.parse({ header: { fullName } })
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
  if (section === 'experiences' || section === 'projects') {
    const raw = Array.isArray(values.bullets) ? values.bullets : []
    item.bullets = raw
      .map((entry) => (typeof entry === 'string' ? entry : (entry as { text?: unknown })?.text))
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      .slice(0, CV_LIMITS.bullets)
      .map((entry) => ({ id: newCvId(), text: entry.slice(0, CV_LIMITS.bullet) }))
  }
  if (section === 'skills') {
    const raw = Array.isArray(values.items) ? values.items : []
    item.items = raw
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      .slice(0, CV_LIMITS.skillItems)
      .map((entry) => entry.slice(0, CV_LIMITS.skillItem))
  }
  return item as unknown as CvSectionItems[K]
}

// --- Design and templates -----------------------------------------------------

export const cvFonts = ['inter', 'lato', 'source-serif'] as const
export const CvFont = z.enum(cvFonts)
export type CvFont = z.infer<typeof CvFont>

export const cvDensities = ['comfortable', 'normal', 'compact'] as const
export const CvDensity = z.enum(cvDensities)
export type CvDensity = z.infer<typeof CvDensity>

export const cvLanguages = ['fr', 'en'] as const
export const CvLanguageCode = z.enum(cvLanguages)
export type CvLanguageCode = z.infer<typeof CvLanguageCode>

/** Accent colors offered in the design panel (any #rrggbb is accepted). */
export const cvAccentPresets = [
  { value: '#c8410b', label: 'Orange brûlé' },
  { value: '#1d4ed8', label: 'Bleu' },
  { value: '#047857', label: 'Vert' },
  { value: '#6d28d9', label: 'Violet' },
  { value: '#9f1239', label: 'Bordeaux' },
  { value: '#334155', label: 'Ardoise' },
] as const

export const CvDesign = z.object({
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide.')
    .default(cvAccentPresets[0].value),
  font: CvFont.default('inter'),
  density: CvDensity.default('normal'),
  /** Language of the section titles and of « Aujourd'hui » / « Present ». */
  language: CvLanguageCode.default('fr'),
})
export type CvDesign = z.infer<typeof CvDesign>

export const cvTemplateIds = ['sobre', 'moderne', 'compact'] as const
export const CvTemplateId = z.enum(cvTemplateIds)
export type CvTemplateId = z.infer<typeof CvTemplateId>

export interface CvTemplateInfo {
  label: string
  description: string
  layout: 'single-column' | 'sidebar'
  /** Shown by the live checks when the template has a known ATS drawback. */
  atsNote: string | null
}

export const cvTemplates: Record<CvTemplateId, CvTemplateInfo> = {
  sobre: {
    label: 'Sobre',
    description:
      'Une colonne, titres soulignés : le plus lisible par les logiciels de recrutement.',
    layout: 'single-column',
    atsNote: null,
  },
  moderne: {
    label: 'Moderne',
    description: 'Une colonne latérale colorée pour le contact, les compétences et les langues.',
    layout: 'sidebar',
    atsNote:
      'Le modèle « Moderne » a deux colonnes : certains logiciels de recrutement (ATS) les lisent dans le désordre. Préfère « Sobre » ou « Compact » pour les candidatures en ligne.',
  },
  compact: {
    label: 'Compact',
    description: 'Une colonne serrée, dates sur la ligne du poste : pensé pour tenir sur une page.',
    layout: 'single-column',
    atsNote: null,
  },
}

export const cvFontLabels: Record<CvFont, string> = {
  inter: 'Inter (sans empattement)',
  lato: 'Lato (arrondie)',
  'source-serif': 'Source Serif (avec empattement)',
}

export const cvDensityLabels: Record<CvDensity, string> = {
  comfortable: 'Aérée',
  normal: 'Normale',
  compact: 'Serrée',
}

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
  },
}

/** The title shown for a section: its custom title, else the default one. */
export function cvSectionTitle(section: CvSectionConfig, language: CvLanguageCode): string {
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
    section === 'experiences'
      ? [record.title, record.organization]
      : section === 'education'
        ? [record.degree, record.school]
        : [record.name]
  const label = parts.filter((part) => part?.trim()).join(' · ')
  return label || 'Sans titre'
}
