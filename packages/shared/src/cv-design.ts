import * as z from 'zod'
import { CvLanguageCode } from './cv'

/**
 * Design settings of a CV document (v2), stored as JSON in
 * `cv_documents.design`.
 *
 * A template (cv-templates.ts) gives a full set of design tokens; the
 * document stores only the user's **overrides**, as optional fields. The
 * renderer merges both with `resolveCvDesign`. Switching template keeps the
 * overrides (the user's deliberate choices) and takes the new template's
 * defaults for everything else; « Réinitialiser au modèle » is
 * `resetCvDesign`.
 *
 * `language` and `pageFormat` are document settings, not template tokens:
 * they are always stored.
 */

export const CV_DESIGN_VERSION = 2

// --- Token values ------------------------------------------------------------------

/** Page composition. See packages/cv-render (layouts). */
export const cvLayouts = ['single', 'sidebar-left', 'sidebar-right', 'split', 'banner'] as const
export const CvLayout = z.enum(cvLayouts)
export type CvLayout = z.infer<typeof CvLayout>

/**
 * Header styles.
 * - `left`: name, title and a contact line, aligned left.
 * - `centered`: the same, centered.
 * - `inline`: name and title on one line, contact line below (dense).
 * - `split`: name and title on the left, contact details stacked on the right.
 * - `band`: everything in a full-width band of the primary color.
 * - `sidebar`: name and title above the main column, contact details at the
 *   top of the side column (two-column layouts; `left` elsewhere).
 */
export const cvHeaderStyles = ['left', 'centered', 'inline', 'split', 'band', 'sidebar'] as const
export const CvHeaderStyle = z.enum(cvHeaderStyles)
export type CvHeaderStyle = z.infer<typeof CvHeaderStyle>

/**
 * Section title styles.
 * - `rule`: uppercase title over a full-width rule.
 * - `underline`: uppercase title over a short thick bar.
 * - `block`: title in a filled band of the primary color.
 * - `bar`: vertical bar on the left of the title.
 * - `plain`: uppercase colored title, nothing else.
 */
export const cvSectionTitleStyles = ['rule', 'underline', 'block', 'bar', 'plain'] as const
export const CvSectionTitleStyle = z.enum(cvSectionTitleStyles)
export type CvSectionTitleStyle = z.infer<typeof CvSectionTitleStyle>

/**
 * How an item (experience, diploma...) is laid out.
 * - `dates-right`: title line with the dates aligned right, place below.
 * - `dates-below`: title line, then « dates · place » in small type.
 * - `compact`: « Title — Organization, Place » and the dates on one line.
 * - `timeline`: dates in a narrow left column, the item on the right.
 */
export const cvItemStyles = ['dates-right', 'dates-below', 'compact', 'timeline'] as const
export const CvItemStyle = z.enum(cvItemStyles)
export type CvItemStyle = z.infer<typeof CvItemStyle>

export const cvBulletStyles = ['dot', 'dash', 'none'] as const
export const CvBulletStyle = z.enum(cvBulletStyles)
export type CvBulletStyle = z.infer<typeof CvBulletStyle>

/**
 * Skill renderers.
 * - `inline`: « Group : a, b, c ».
 * - `list`: group name, then its skills joined by « · ».
 * - `tags`: skills as tinted tags.
 * - `bars` / `dots`: one skill per line with its level (0 = no level drawn).
 */
export const cvSkillStyles = ['inline', 'list', 'tags', 'bars', 'dots'] as const
export const CvSkillStyle = z.enum(cvSkillStyles)
export type CvSkillStyle = z.infer<typeof CvSkillStyle>

/**
 * Language renderers.
 * - `inline`: « Anglais (C1) · Espagnol (B2) » on one line.
 * - `list`: one language per line, « Anglais · C1 ».
 * - `bars` / `dots`: one per line with a gauge from the CEFR level.
 * - `cefr`: one per line with the CEFR label (« C1 · Autonome »).
 */
export const cvLanguageStyles = ['inline', 'list', 'bars', 'dots', 'cefr'] as const
export const CvLanguageStyle = z.enum(cvLanguageStyles)
export type CvLanguageStyle = z.infer<typeof CvLanguageStyle>

export const cvLineHeights = ['tight', 'normal', 'relaxed'] as const
export const CvLineHeight = z.enum(cvLineHeights)
export type CvLineHeight = z.infer<typeof CvLineHeight>

export const cvSpacings = ['compact', 'normal', 'comfortable'] as const
export const CvSpacing = z.enum(cvSpacings)
export type CvSpacing = z.infer<typeof CvSpacing>

export const cvMargins = ['narrow', 'normal', 'wide'] as const
export const CvMargins = z.enum(cvMargins)
export type CvMargins = z.infer<typeof CvMargins>

export const cvPageFormats = ['A4', 'Letter'] as const
export const CvPageFormat = z.enum(cvPageFormats)
export type CvPageFormat = z.infer<typeof CvPageFormat>

/** Font size steps around the template's base size: each step is ±6 %. */
export const CV_FONT_SIZE_STEPS = { min: -2, max: 2 } as const

export const CvColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide.')

// --- Font pairings --------------------------------------------------------------------

/**
 * Font pairings: a heading font (name, section titles) and a body font. The
 * files are in packages/cv-render/fonts (WOFF, Latin + Latin Extended, OFL).
 * `inter`, `lato` and `source-serif` are the v1 fonts.
 */
export const cvFontPairingIds = [
  'inter',
  'lato',
  'source-serif',
  'source',
  'playfair-source-sans',
  'montserrat-open-sans',
  'lora-source-sans',
  'eb-garamond',
  'ibm-plex',
  'poppins-inter',
] as const
export const CvFontPairingId = z.enum(cvFontPairingIds)
export type CvFontPairingId = z.infer<typeof CvFontPairingId>

/** Font families with files in packages/cv-render/fonts (file prefix). */
export const cvFontFamilies = [
  'inter',
  'carlito',
  'source-serif-4',
  'source-sans-3',
  'open-sans',
  'eb-garamond',
  'ibm-plex-sans',
  'playfair-display',
  'montserrat',
  'lora',
  'poppins',
] as const
export type CvFontFamily = (typeof cvFontFamilies)[number]

export interface CvFontPairing {
  label: string
  /** One-line character of the pairing, for the design panel. */
  description: string
  heading: CvFontFamily
  body: CvFontFamily
  serif: boolean
}

export const cvFontPairings: Record<CvFontPairingId, CvFontPairing> = {
  inter: {
    label: 'Inter',
    description: 'Sans empattement, nette et neutre.',
    heading: 'inter',
    body: 'inter',
    serif: false,
  },
  lato: {
    label: 'Lato (Carlito)',
    description: 'Sans empattement aux formes rondes (Carlito reprend le dessin de Lato).',
    heading: 'carlito',
    body: 'carlito',
    serif: false,
  },
  'source-serif': {
    label: 'Source Serif',
    description: 'Avec empattement, classique et très lisible.',
    heading: 'source-serif-4',
    body: 'source-serif-4',
    serif: true,
  },
  source: {
    label: 'Source Serif + Source Sans',
    description: 'Titres avec empattement, texte sans : sérieux et moderne.',
    heading: 'source-serif-4',
    body: 'source-sans-3',
    serif: true,
  },
  'playfair-source-sans': {
    label: 'Playfair + Source Sans',
    description: 'Titres élégants à fort contraste.',
    heading: 'playfair-display',
    body: 'source-sans-3',
    serif: true,
  },
  'montserrat-open-sans': {
    label: 'Montserrat + Open Sans',
    description: 'Titres géométriques, texte amical.',
    heading: 'montserrat',
    body: 'open-sans',
    serif: false,
  },
  'lora-source-sans': {
    label: 'Lora + Source Sans',
    description: 'Titres chaleureux avec empattement.',
    heading: 'lora',
    body: 'source-sans-3',
    serif: true,
  },
  'eb-garamond': {
    label: 'EB Garamond',
    description: 'Garamond classique : juridique, édition, recherche.',
    heading: 'eb-garamond',
    body: 'eb-garamond',
    serif: true,
  },
  'ibm-plex': {
    label: 'IBM Plex Sans',
    description: 'Technique et précise.',
    heading: 'ibm-plex-sans',
    body: 'ibm-plex-sans',
    serif: false,
  },
  'poppins-inter': {
    label: 'Poppins + Inter',
    description: 'Titres ronds et affirmés, texte neutre.',
    heading: 'poppins',
    body: 'inter',
    serif: false,
  },
}

// --- Palettes ----------------------------------------------------------------------------

/** Accent colors offered in the design panel (any #rrggbb is accepted). */
export const cvAccentPresets = [
  { value: '#c8410b', label: 'Orange brûlé' },
  { value: '#1d4ed8', label: 'Bleu' },
  { value: '#047857', label: 'Vert' },
  { value: '#6d28d9', label: 'Violet' },
  { value: '#9f1239', label: 'Bordeaux' },
  { value: '#334155', label: 'Ardoise' },
] as const

/** The palette colors a user can override. */
export const CvPaletteOverrides = z.object({
  /** Accent: names, section titles, rules, markers. */
  primary: CvColor.optional(),
  /** Light accent: thin rules, tags, gauges' background. */
  secondary: CvColor.optional(),
  /** Body text. */
  text: CvColor.optional(),
  /** Background of the side column (sidebar layouts). */
  sidebarBg: CvColor.optional(),
})
export type CvPaletteOverrides = z.infer<typeof CvPaletteOverrides>

// --- The stored design -----------------------------------------------------------------

/**
 * The design stored with a document: document settings plus the user's
 * overrides of the template's tokens (an absent field = the template's value).
 */
const CvDesignObject = z.object({
  version: z.literal(CV_DESIGN_VERSION).default(CV_DESIGN_VERSION),
  /** Language of the section titles and of « Aujourd'hui » / « Present ». */
  language: CvLanguageCode.default('fr'),
  pageFormat: CvPageFormat.default('A4'),
  palette: CvPaletteOverrides.default({}),
  layout: CvLayout.optional(),
  fontPairing: CvFontPairingId.optional(),
  fontSize: z.number().int().min(CV_FONT_SIZE_STEPS.min).max(CV_FONT_SIZE_STEPS.max).optional(),
  lineHeight: CvLineHeight.optional(),
  spacing: CvSpacing.optional(),
  margins: CvMargins.optional(),
  headerStyle: CvHeaderStyle.optional(),
  sectionTitleStyle: CvSectionTitleStyle.optional(),
  itemStyle: CvItemStyle.optional(),
  bulletStyle: CvBulletStyle.optional(),
  skillStyle: CvSkillStyle.optional(),
  languageStyle: CvLanguageStyle.optional(),
  showIcons: z.boolean().optional(),
})

/** Override keys of `CvDesign` (everything but the document settings). */
export const cvDesignOverrideKeys = [
  'palette',
  'layout',
  'fontPairing',
  'fontSize',
  'lineHeight',
  'spacing',
  'margins',
  'headerStyle',
  'sectionTitleStyle',
  'itemStyle',
  'bulletStyle',
  'skillStyle',
  'languageStyle',
  'showIcons',
] as const satisfies ReadonlyArray<keyof z.infer<typeof CvDesignObject>>

const V1_FONTS: Record<string, CvFontPairingId> = {
  inter: 'inter',
  lato: 'lato',
  'source-serif': 'source-serif',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Upgrades a stored or received design to v2, before validation. Pure and
 * idempotent. `null` values (a cleared field in the editor) mean "no
 * override" and are dropped.
 *
 * v1 (`{ accentColor, font, density, language }`) → v2: the accent becomes
 * the primary color override and the font the font pairing override (both
 * were explicit choices, so the CV keeps its look); density becomes spacing
 * and font size overrides (`normal` = no override). An invalid accent is kept
 * as the override, so the schema still rejects it.
 */
export function upgradeCvDesign(raw: unknown): unknown {
  if (!isRecord(raw)) return raw
  const withoutNulls = (value: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null))
  if (raw.version === CV_DESIGN_VERSION) {
    const next = withoutNulls(raw)
    if (isRecord(next.palette)) next.palette = withoutNulls(next.palette)
    return next
  }
  if (raw.version !== undefined && raw.version !== 1) return raw

  const { accentColor, font, density, ...rest } = withoutNulls(raw)
  const next: Record<string, unknown> = { ...rest, version: CV_DESIGN_VERSION }
  if (accentColor !== undefined) {
    next.palette = { ...(isRecord(rest.palette) ? rest.palette : {}), primary: accentColor }
  }
  if (typeof font === 'string') next.fontPairing = V1_FONTS[font] ?? font
  if (density === 'compact') Object.assign(next, { spacing: 'compact', fontSize: -1 })
  if (density === 'comfortable') Object.assign(next, { spacing: 'comfortable', fontSize: 1 })
  return next
}

/** The design schema (v2). Accepts v1 designs, upgraded by `upgradeCvDesign`. */
export const CvDesign = z.preprocess(upgradeCvDesign, CvDesignObject)
export type CvDesign = z.infer<typeof CvDesignObject>

/** The design without any override: the template's look, the document's settings kept. */
export function resetCvDesign(design: CvDesign): CvDesign {
  return {
    version: CV_DESIGN_VERSION,
    language: design.language,
    pageFormat: design.pageFormat,
    palette: {},
  }
}

// --- Labels (design panel) --------------------------------------------------------------------

export const cvLayoutLabels: Record<CvLayout, string> = {
  single: 'Une colonne',
  'sidebar-left': 'Colonne latérale à gauche',
  'sidebar-right': 'Colonne latérale à droite',
  split: 'Deux colonnes égales',
  banner: 'Bandeau coloré',
}

export const cvHeaderStyleLabels: Record<CvHeaderStyle, string> = {
  left: 'Aligné à gauche',
  centered: 'Centré',
  inline: 'Compact, sur une ligne',
  split: 'Contact à droite',
  band: 'Dans un bandeau',
  sidebar: 'Contact dans la colonne',
}

export const cvSectionTitleStyleLabels: Record<CvSectionTitleStyle, string> = {
  rule: 'Filet sur toute la largeur',
  underline: 'Trait court',
  block: 'Bandeau coloré',
  bar: 'Barre verticale',
  plain: 'Simple',
}

export const cvItemStyleLabels: Record<CvItemStyle, string> = {
  'dates-right': 'Dates à droite',
  'dates-below': 'Dates sous le titre',
  compact: 'Tout sur une ligne',
  timeline: 'Dates dans une colonne',
}

export const cvBulletStyleLabels: Record<CvBulletStyle, string> = {
  dot: 'Points',
  dash: 'Tirets',
  none: 'Aucune puce',
}

export const cvSkillStyleLabels: Record<CvSkillStyle, string> = {
  inline: 'Texte en ligne',
  list: 'Liste par groupe',
  tags: 'Étiquettes',
  bars: 'Barres de niveau',
  dots: 'Points de niveau',
}

export const cvLanguageStyleLabels: Record<CvLanguageStyle, string> = {
  inline: 'Sur une ligne',
  list: 'Une par ligne',
  bars: 'Barres de niveau',
  dots: 'Points de niveau',
  cefr: 'Niveau CECRL',
}

export const cvLineHeightLabels: Record<CvLineHeight, string> = {
  tight: 'Serré',
  normal: 'Normal',
  relaxed: 'Aéré',
}

export const cvSpacingLabels: Record<CvSpacing, string> = {
  compact: 'Serré',
  normal: 'Normal',
  comfortable: 'Aéré',
}

export const cvMarginLabels: Record<CvMargins, string> = {
  narrow: 'Étroites',
  normal: 'Normales',
  wide: 'Larges',
}

export const cvPageFormatLabels: Record<CvPageFormat, string> = {
  A4: 'A4 (Europe)',
  Letter: 'Lettre US',
}
