import * as z from 'zod'
import type { CvLanguageCode, CvSectionKey } from './cv'
import {
  CV_FONT_SIZE_STEPS,
  type CvBulletStyle,
  type CvDesign,
  type CvFontPairingId,
  type CvHeaderStyle,
  type CvItemStyle,
  type CvLanguageStyle,
  type CvLayout,
  type CvLineHeight,
  type CvMargins,
  type CvPageFormat,
  type CvSectionTitleStyle,
  type CvSkillStyle,
  type CvSpacing,
} from './cv-design'
import { tintColor } from './cv-colors'

export * from './cv-colors'

/**
 * CV templates: metadata and default design tokens. A template is data, in
 * this file, because the browser (gallery, design panel, live checks), the
 * API (validation) and the renderer all need it. The renderer
 * (`@piston/cv-render`) turns the resolved tokens into a PDF; no template
 * has code of its own. See CONTRIBUTING.md (« Adding a CV template »).
 */

/** In gallery order: ATS first, then modern, creative, one-page. */
export const cvTemplateIds = [
  'sobre',
  'classique',
  'executif',
  'minimal',
  'moderne',
  'ardoise',
  'chronologie',
  'duo',
  'portrait',
  'rivage',
  'direction',
  'horizon',
  'creatif',
  'impact',
  'editorial',
  'geometrie',
  'compact',
  'etudiant',
] as const
export const CvTemplateId = z.enum(cvTemplateIds)
export type CvTemplateId = z.infer<typeof CvTemplateId>

/** Gallery categories: « Sobre / ATS », « Moderne », « Créatif », « Une page ». */
export const cvTemplateCategories = ['ats', 'moderne', 'creatif', 'une-page'] as const
export type CvTemplateCategory = (typeof cvTemplateCategories)[number]

export const cvTemplateCategoryLabels: Record<CvTemplateCategory, string> = {
  ats: 'Sobre / ATS',
  moderne: 'Moderne',
  creatif: 'Créatif',
  'une-page': 'Une page',
}

/**
 * How well applicant tracking systems read the template: `optimal` (one
 * column, standard headings), `bon` (minor risks: icons, a header band),
 * `limite` (columns that some ATS read out of order).
 */
export const cvAtsLevels = ['optimal', 'bon', 'limite'] as const
export type CvAtsLevel = (typeof cvAtsLevels)[number]

export const cvAtsLevelLabels: Record<CvAtsLevel, string> = {
  optimal: 'Lecture ATS optimale',
  bon: 'Bonne lecture ATS',
  limite: 'Lecture ATS à risque',
}

/**
 * A template palette color: a fixed `#rrggbb`, or a tint of the resolved
 * primary color (`{ tint: 0.9 }` = 90 % towards white), so derived colors
 * follow the user's accent.
 */
export type CvColorDefault = string | { tint: number }

export interface CvTemplatePalette {
  primary: string
  secondary: CvColorDefault
  text: string
  muted: string
  sidebarBg: CvColorDefault
}

/** Every design token, as a template defines it. */
export interface CvDesignTokens {
  layout: CvLayout
  palette: CvTemplatePalette
  fontPairing: CvFontPairingId
  fontSize: number
  lineHeight: CvLineHeight
  spacing: CvSpacing
  margins: CvMargins
  headerStyle: CvHeaderStyle
  sectionTitleStyle: CvSectionTitleStyle
  itemStyle: CvItemStyle
  bulletStyle: CvBulletStyle
  skillStyle: CvSkillStyle
  languageStyle: CvLanguageStyle
  showIcons: boolean
}

/** Template-only typography and layout settings (not overridable by the user). */
export interface CvTemplateTypography {
  /** Body size in points at font size step 0. */
  baseSize: number
  /** Name size in points at step 0. */
  nameSize: number
  /** Job title size in points at step 0. */
  titleSize: number
  /** Width of the side column in points (sidebar layouts). */
  sidebarWidth: number
  /** Sections placed in the side column when their `column` is `auto` (two-column layouts). */
  sideSections: readonly CvSectionKey[]
  /**
   * Photo size multiplier (1 = the photo's own size). Templates built around
   * the photo enlarge it; it never exceeds the column it sits in.
   */
  photoScale?: number
  /**
   * Fill of the header band (`band` header style, `banner` layout): the
   * primary color, or the side column's color (`palette.sidebarBg`), e.g. a
   * charcoal band with an accent line under it.
   */
  bandFill?: 'primary' | 'sidebar'
  /** Job title in spaced capitals (editorial headers). */
  titleCaps?: boolean
  /**
   * Decorative shapes drawn behind the page (never text): `strip`, a band of
   * the primary color along the left edge; `shapes`, tinted circles in the
   * corners of the first page and a small one on the next pages.
   */
  ornament?: 'none' | 'strip' | 'shapes'
}

/**
 * How a template treats the photo: `feature` (built around it: large, in a
 * colored area), `fits` (it has a natural place), `none` (a plain template:
 * the gallery shows it without the sample photo; a user's photo is still drawn).
 */
export type CvTemplatePhoto = 'feature' | 'fits' | 'none'

export interface CvTemplateMeta {
  id: CvTemplateId
  label: string
  description: string
  category: CvTemplateCategory
  atsLevel: CvAtsLevel
  /** Shown by the live checks when the template has a known ATS drawback. */
  atsNote: string | null
  /**
   * Recommended order of the sections, applied when a document is created
   * with this template (never afterwards: the user's order is theirs).
   * Sections not listed keep their usual place after the listed ones.
   */
  sectionOrder?: readonly CvSectionKey[]
  photo: CvTemplatePhoto
  defaults: CvDesignTokens
  typography: CvTemplateTypography
}

/** Palette with every color resolved to `#rrggbb`. */
export interface CvResolvedPalette {
  primary: string
  secondary: string
  text: string
  muted: string
  sidebarBg: string
}

/** What the renderer draws with: the template's tokens, the user's overrides applied. */
export interface ResolvedCvDesign extends Omit<CvDesignTokens, 'palette'> {
  templateId: CvTemplateId
  palette: CvResolvedPalette
  typography: CvTemplateTypography
  language: CvLanguageCode
  pageFormat: CvPageFormat
}

const SIDEBAR_SECTIONS: readonly CvSectionKey[] = [
  'skills',
  'languages',
  'certifications',
  'interests',
  'awards',
  'references',
  'extras',
]

/** Shared starting point of the templates below: each overrides what makes it different. */
const BASE_TOKENS: CvDesignTokens = {
  layout: 'single',
  palette: {
    primary: '#c8410b',
    secondary: { tint: 0.55 },
    text: '#1c1917',
    muted: '#57534e',
    sidebarBg: { tint: 0.9 },
  },
  fontPairing: 'inter',
  fontSize: 0,
  lineHeight: 'normal',
  spacing: 'normal',
  margins: 'normal',
  headerStyle: 'left',
  sectionTitleStyle: 'rule',
  itemStyle: 'dates-right',
  bulletStyle: 'dot',
  skillStyle: 'inline',
  languageStyle: 'inline',
  showIcons: false,
}

const BASE_TYPOGRAPHY: CvTemplateTypography = {
  baseSize: 10,
  nameSize: 26,
  titleSize: 12.5,
  sidebarWidth: 180,
  sideSections: SIDEBAR_SECTIONS,
}

const withPalette = (palette: Partial<CvTemplatePalette>): CvTemplatePalette => ({
  ...BASE_TOKENS.palette,
  ...palette,
})

const columnsNote = (label: string) =>
  `Le modèle « ${label} » a deux colonnes : certains logiciels de recrutement (ATS) les lisent dans le désordre. Préfère « Sobre » ou « Classique » pour les candidatures en ligne.`

const STUDENT_ORDER: readonly CvSectionKey[] = [
  'summary',
  'education',
  'projects',
  'experiences',
  'volunteering',
  'skills',
  'languages',
  'certifications',
  'awards',
  'interests',
]

type TemplateEntry = Omit<CvTemplateMeta, 'id' | 'defaults' | 'typography'> & {
  defaults: Partial<CvDesignTokens>
  typography?: Partial<CvTemplateTypography>
}

const entries: Record<CvTemplateId, TemplateEntry> = {
  // --- Sobre / ATS: one column, standard headings -----------------------------------
  sobre: {
    label: 'Sobre',
    description:
      'Une colonne, titres soulignés : le plus lisible par les logiciels de recrutement.',
    category: 'ats',
    atsLevel: 'optimal',
    atsNote: null,
    photo: 'none',
    defaults: { palette: withPalette({ secondary: { tint: 0 } }) },
    typography: { nameSize: 24, titleSize: 13 },
  },
  classique: {
    label: 'Classique',
    description: 'Garamond, en-tête centré, filets fins : sobre et intemporel.',
    category: 'ats',
    atsLevel: 'optimal',
    atsNote: null,
    photo: 'fits',
    defaults: {
      palette: withPalette({ primary: '#1f3a5f', secondary: { tint: 0.6 } }),
      fontPairing: 'eb-garamond',
      headerStyle: 'centered',
      sectionTitleStyle: 'rule',
    },
    typography: { baseSize: 10.5, nameSize: 29, titleSize: 13 },
  },
  executif: {
    label: 'Exécutif',
    description: 'Retenu et élégant : petites capitales, grandes marges, contact à droite.',
    category: 'ats',
    atsLevel: 'optimal',
    atsNote: null,
    photo: 'fits',
    defaults: {
      palette: withPalette({ primary: '#8a1c2b', muted: '#52525b' }),
      fontPairing: 'lora-source-sans',
      margins: 'wide',
      headerStyle: 'split',
      sectionTitleStyle: 'smallcaps',
      bulletStyle: 'dash',
    },
    typography: { nameSize: 27, titleSize: 12 },
  },
  minimal: {
    label: 'Minimal',
    description: 'Beaucoup d’air, des titres discrets et une seule couleur sobre.',
    category: 'ats',
    atsLevel: 'optimal',
    atsNote: null,
    photo: 'none',
    defaults: {
      palette: withPalette({ primary: '#3f3f46', muted: '#636369', secondary: '#d4d4d8' }),
      fontPairing: 'ibm-plex',
      lineHeight: 'relaxed',
      spacing: 'comfortable',
      margins: 'wide',
      sectionTitleStyle: 'plain',
      itemStyle: 'dates-below',
      bulletStyle: 'dash',
    },
    typography: { baseSize: 9.5, nameSize: 30, titleSize: 12 },
  },

  // --- Moderne ----------------------------------------------------------------------------
  moderne: {
    label: 'Moderne',
    description:
      'Colonne latérale colorée : photo, contact, compétences en barres et langues en un coup d’œil.',
    category: 'moderne',
    atsLevel: 'limite',
    atsNote: columnsNote('Moderne'),
    photo: 'fits',
    defaults: {
      layout: 'sidebar-left',
      palette: withPalette({ primary: '#1e40af' }),
      headerStyle: 'sidebar',
      sectionTitleStyle: 'underline',
      itemStyle: 'dates-below',
      skillStyle: 'bars',
      languageStyle: 'dots',
      showIcons: true,
    },
    typography: { baseSize: 9.5, nameSize: 27, sidebarWidth: 190, photoScale: 1.4 },
  },
  ardoise: {
    label: 'Ardoise',
    description: 'Colonne latérale sombre à texte clair, contact et compétences en un coup d’œil.',
    category: 'moderne',
    atsLevel: 'limite',
    atsNote: columnsNote('Ardoise'),
    photo: 'fits',
    defaults: {
      layout: 'sidebar-left',
      palette: withPalette({ primary: '#0e7490', sidebarBg: '#1f2937' }),
      fontPairing: 'poppins-inter',
      headerStyle: 'sidebar',
      sectionTitleStyle: 'underline',
      itemStyle: 'dates-below',
      skillStyle: 'dots',
      languageStyle: 'bars',
      showIcons: true,
    },
    typography: { baseSize: 9.5, nameSize: 26, sidebarWidth: 200, photoScale: 1.4 },
  },
  chronologie: {
    label: 'Chronologie',
    description: 'Les dates dans une colonne, reliées par une ligne du temps ; titres à icônes.',
    category: 'moderne',
    atsLevel: 'bon',
    atsNote:
      'Les dates sont dans une colonne à part : la plupart des logiciels de recrutement les lisent bien, mais « Sobre » reste le plus sûr.',
    photo: 'fits',
    defaults: {
      palette: withPalette({ primary: '#4338ca' }),
      fontPairing: 'lora-source-sans',
      headerStyle: 'split',
      sectionTitleStyle: 'plain',
      itemStyle: 'timeline',
      skillStyle: 'tags',
      languageStyle: 'cefr',
      showIcons: true,
    },
    typography: { nameSize: 27, titleSize: 13 },
  },
  duo: {
    label: 'Duo',
    description: 'Deux colonnes égales : le parcours à gauche, les compétences notées à droite.',
    category: 'moderne',
    atsLevel: 'limite',
    atsNote: columnsNote('Duo'),
    photo: 'fits',
    defaults: {
      layout: 'split',
      palette: withPalette({ primary: '#0f4c5c' }),
      fontPairing: 'source',
      margins: 'narrow',
      headerStyle: 'centered',
      sectionTitleStyle: 'smallcaps',
      itemStyle: 'dates-below',
      skillStyle: 'dots',
      languageStyle: 'cefr',
    },
    typography: { baseSize: 9.5, nameSize: 28 },
  },
  portrait: {
    label: 'Portrait',
    description:
      'Construit autour de la photo : grand portrait rond dans une colonne colorée, le nom à côté.',
    category: 'moderne',
    atsLevel: 'limite',
    atsNote: columnsNote('Portrait'),
    photo: 'feature',
    defaults: {
      layout: 'sidebar-left',
      palette: withPalette({ primary: '#4d7c0f', sidebarBg: { tint: 0.86 } }),
      fontPairing: 'montserrat-open-sans',
      headerStyle: 'sidebar',
      sectionTitleStyle: 'bar',
      itemStyle: 'dates-below',
      skillStyle: 'bars',
      languageStyle: 'cefr',
      showIcons: true,
    },
    typography: {
      baseSize: 9.5,
      nameSize: 32,
      titleSize: 13.5,
      sidebarWidth: 200,
      photoScale: 1.9,
    },
  },
  rivage: {
    label: 'Rivage',
    description:
      'Colonne colorée à droite : photo, jauges de compétences et points de langues ; le parcours à gauche.',
    category: 'moderne',
    atsLevel: 'limite',
    atsNote: columnsNote('Rivage'),
    photo: 'feature',
    defaults: {
      layout: 'sidebar-right',
      palette: withPalette({ primary: '#0369a1', sidebarBg: '#0c4a6e' }),
      fontPairing: 'poppins-inter',
      headerStyle: 'sidebar',
      sectionTitleStyle: 'rule',
      itemStyle: 'dates-right',
      skillStyle: 'bars',
      languageStyle: 'dots',
      showIcons: true,
    },
    typography: { baseSize: 9.5, nameSize: 28, sidebarWidth: 196, photoScale: 1.6 },
  },
  direction: {
    label: 'Direction',
    description:
      'Bandeau anthracite et filet de couleur, ligne du temps nette : pour les postes d’encadrement.',
    category: 'moderne',
    atsLevel: 'bon',
    atsNote:
      'Le bandeau sombre est lu comme du texte normal par la plupart des logiciels de recrutement ; « Sobre » reste le plus sûr pour les portails.',
    photo: 'fits',
    defaults: {
      layout: 'banner',
      palette: withPalette({ primary: '#b45309', sidebarBg: '#262b33' }),
      fontPairing: 'source',
      margins: 'narrow',
      headerStyle: 'band',
      sectionTitleStyle: 'smallcaps',
      itemStyle: 'timeline',
      bulletStyle: 'dash',
      skillStyle: 'list',
      languageStyle: 'cefr',
    },
    typography: {
      baseSize: 9.5,
      nameSize: 28,
      titleSize: 12.5,
      bandFill: 'sidebar',
      titleCaps: true,
    },
  },

  // --- Créatif ----------------------------------------------------------------------------
  horizon: {
    label: 'Horizon',
    description: 'Un bandeau clair teinté en tête, puis une colonne aérée aux titres à barre.',
    category: 'creatif',
    atsLevel: 'bon',
    atsNote:
      'Le bandeau est lu comme du texte normal par la plupart des logiciels de recrutement ; vérifie que l’export reste lisible en noir et blanc.',
    photo: 'fits',
    defaults: {
      layout: 'banner',
      palette: withPalette({ primary: '#15803d', sidebarBg: { tint: 0.88 } }),
      fontPairing: 'montserrat-open-sans',
      headerStyle: 'band',
      sectionTitleStyle: 'bar',
      skillStyle: 'tags',
      languageStyle: 'cefr',
      showIcons: true,
    },
    typography: { baseSize: 9.5, nameSize: 28, titleSize: 13, bandFill: 'sidebar' },
  },
  creatif: {
    label: 'Créatif',
    description: 'Bandeau et titres en aplats de couleur, compétences en étiquettes.',
    category: 'creatif',
    atsLevel: 'limite',
    atsNote: columnsNote('Créatif'),
    photo: 'fits',
    defaults: {
      layout: 'sidebar-right',
      palette: withPalette({ primary: '#7c3aed', sidebarBg: { tint: 0.92 } }),
      fontPairing: 'poppins-inter',
      headerStyle: 'band',
      sectionTitleStyle: 'block',
      skillStyle: 'tags',
      languageStyle: 'dots',
      showIcons: true,
    },
    typography: { baseSize: 9.5, nameSize: 28, titleSize: 13, sidebarWidth: 190 },
  },
  impact: {
    label: 'Impact',
    description: 'Grand bandeau de couleur avec photo et contacts à icônes, puis deux colonnes.',
    category: 'creatif',
    atsLevel: 'limite',
    atsNote: columnsNote('Impact'),
    photo: 'feature',
    defaults: {
      layout: 'split',
      palette: withPalette({ primary: '#b91c1c' }),
      fontPairing: 'montserrat-open-sans',
      margins: 'narrow',
      headerStyle: 'band',
      sectionTitleStyle: 'underline',
      itemStyle: 'dates-below',
      skillStyle: 'bars',
      languageStyle: 'dots',
      showIcons: true,
    },
    typography: { baseSize: 9.5, nameSize: 30, titleSize: 13.5, photoScale: 1.3 },
  },
  editorial: {
    label: 'Éditorial',
    description:
      'Mise en page de magazine : nom en très grand, titres en marge, filets fins et beaucoup de blanc.',
    category: 'creatif',
    atsLevel: 'bon',
    atsNote:
      'Les titres sont dans une marge à gauche des sections : la plupart des logiciels de recrutement les lisent dans l’ordre, mais « Sobre » reste le plus sûr.',
    photo: 'fits',
    defaults: {
      palette: withPalette({ primary: '#9a3412', secondary: '#d6d3d1' }),
      fontPairing: 'playfair-source-sans',
      sectionTitleStyle: 'sidehead',
      itemStyle: 'dates-below',
      bulletStyle: 'dash',
      skillStyle: 'list',
      languageStyle: 'list',
    },
    typography: { baseSize: 9.5, nameSize: 44, titleSize: 12, titleCaps: true },
  },
  geometrie: {
    label: 'Géométrie',
    description:
      'Formes géométriques en fond, titres en pastilles à icône et compétences en étiquettes.',
    category: 'creatif',
    atsLevel: 'bon',
    atsNote:
      'Les icônes et les formes décoratives ne gênent pas la plupart des logiciels de recrutement, mais « Sobre » reste le plus sûr.',
    photo: 'fits',
    defaults: {
      palette: withPalette({ primary: '#c026d3' }),
      fontPairing: 'poppins-inter',
      sectionTitleStyle: 'chip',
      itemStyle: 'dates-right',
      skillStyle: 'tags',
      languageStyle: 'dots',
      showIcons: true,
    },
    typography: { nameSize: 30, titleSize: 13, ornament: 'shapes' },
  },

  // --- Une page -------------------------------------------------------------------------
  compact: {
    label: 'Compact',
    description: 'Une colonne serrée, dates sur la ligne du poste : pensé pour tenir sur une page.',
    category: 'une-page',
    atsLevel: 'optimal',
    atsNote: null,
    photo: 'none',
    defaults: {
      palette: withPalette({ primary: '#334155' }),
      lineHeight: 'tight',
      spacing: 'compact',
      margins: 'narrow',
      headerStyle: 'inline',
      itemStyle: 'compact',
    },
    typography: { baseSize: 9, nameSize: 19, titleSize: 11.5, sidebarWidth: 170 },
  },
  etudiant: {
    label: 'Étudiant',
    description: 'La formation et les projets d’abord, sur une page, avec un liseré de couleur.',
    category: 'une-page',
    atsLevel: 'bon',
    atsNote: null,
    sectionOrder: STUDENT_ORDER,
    photo: 'fits',
    defaults: {
      palette: withPalette({ primary: '#0d9488' }),
      fontPairing: 'lato',
      margins: 'narrow',
      spacing: 'compact',
      sectionTitleStyle: 'underline',
      skillStyle: 'tags',
      languageStyle: 'cefr',
    },
    typography: { nameSize: 26, ornament: 'strip' },
  },
}

export const cvTemplates = Object.fromEntries(
  cvTemplateIds.map((id) => {
    const { defaults, typography, ...meta } = entries[id]
    const template: CvTemplateMeta = {
      id,
      ...meta,
      defaults: { ...BASE_TOKENS, ...defaults },
      typography: { ...BASE_TYPOGRAPHY, ...typography },
    }
    return [id, template]
  }),
) as Record<CvTemplateId, CvTemplateMeta>

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * The design to render: the template's tokens with the user's overrides
 * applied, derived colors computed from the resolved primary color. Pure.
 */
export function resolveCvDesign(template: CvTemplateMeta, design: CvDesign): ResolvedCvDesign {
  const { defaults } = template
  const primary = design.palette.primary ?? defaults.palette.primary
  const color = (override: string | undefined, fallback: CvColorDefault) =>
    override ?? (typeof fallback === 'string' ? fallback : tintColor(primary, fallback.tint))

  return {
    templateId: template.id,
    typography: template.typography,
    language: design.language,
    pageFormat: design.pageFormat,
    layout: design.layout ?? defaults.layout,
    palette: {
      primary,
      secondary: color(design.palette.secondary, defaults.palette.secondary),
      text: design.palette.text ?? defaults.palette.text,
      muted: defaults.palette.muted,
      sidebarBg: color(design.palette.sidebarBg, defaults.palette.sidebarBg),
    },
    fontPairing: design.fontPairing ?? defaults.fontPairing,
    fontSize: clamp(
      design.fontSize ?? defaults.fontSize,
      CV_FONT_SIZE_STEPS.min,
      CV_FONT_SIZE_STEPS.max,
    ),
    lineHeight: design.lineHeight ?? defaults.lineHeight,
    spacing: design.spacing ?? defaults.spacing,
    margins: design.margins ?? defaults.margins,
    headerStyle: design.headerStyle ?? defaults.headerStyle,
    sectionTitleStyle: design.sectionTitleStyle ?? defaults.sectionTitleStyle,
    itemStyle: design.itemStyle ?? defaults.itemStyle,
    bulletStyle: design.bulletStyle ?? defaults.bulletStyle,
    skillStyle: design.skillStyle ?? defaults.skillStyle,
    languageStyle: design.languageStyle ?? defaults.languageStyle,
    showIcons: design.showIcons ?? defaults.showIcons,
  }
}

/** True for layouts with a side column, where `sections[].column` matters. */
/**
 * Puts the sections in the template's recommended order (education first
 * for « Étudiant »). Used when a document is created; templates without a
 * `sectionOrder` leave the content as it is.
 */
export function applyTemplateSectionOrder<T extends { sections: { key: string }[] }>(
  content: T,
  template: CvTemplateMeta,
): T {
  const order = template.sectionOrder
  if (!order) return content
  const rank = (key: string) => {
    const index = (order as readonly string[]).indexOf(key)
    return index === -1 ? order.length : index
  }
  // Array.prototype.sort is stable: unlisted sections keep their relative order.
  return { ...content, sections: [...content.sections].sort((a, b) => rank(a.key) - rank(b.key)) }
}

export function isTwoColumnLayout(layout: CvLayout): boolean {
  return layout === 'sidebar-left' || layout === 'sidebar-right' || layout === 'split'
}
