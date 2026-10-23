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

export const cvTemplateIds = [
  'sobre',
  'classique',
  'executif',
  'minimal',
  'moderne',
  'ardoise',
  'chronologie',
  'duo',
  'horizon',
  'creatif',
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
}

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

const withPalette = (palette: Partial<CvTemplatePalette>): CvTemplatePalette => ({
  ...BASE_TOKENS.palette,
  ...palette,
})

const COLUMNS_NOTE =
  'a deux colonnes : certains logiciels de recrutement (ATS) les lisent dans le désordre. Préfère « Sobre » ou « Classique » pour les candidatures en ligne.'

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

const more: Record<Exclude<CvTemplateId, 'sobre' | 'moderne' | 'compact'>, CvTemplateMeta> = {
  classique: {
    id: 'classique',
    label: 'Classique',
    description: 'Police à empattement, en-tête centré : sobre et intemporel.',
    category: 'ats',
    atsLevel: 'optimal',
    atsNote: null,
    defaults: {
      ...BASE_TOKENS,
      palette: withPalette({ primary: '#1f3a5f' }),
      fontPairing: 'source-serif',
      headerStyle: 'centered',
      sectionTitleStyle: 'rule',
    },
    typography: {
      baseSize: 10.5,
      nameSize: 26,
      titleSize: 12.5,
      sidebarWidth: 180,
      sideSections: SIDEBAR_SECTIONS,
    },
  },
  executif: {
    id: 'executif',
    label: 'Exécutif',
    description: 'Retenu et élégant : petites capitales, grandes marges, contact à droite.',
    category: 'ats',
    atsLevel: 'optimal',
    atsNote: null,
    defaults: {
      ...BASE_TOKENS,
      palette: withPalette({ primary: '#8a1c2b', muted: '#52525b' }),
      fontPairing: 'playfair-source-sans',
      margins: 'wide',
      headerStyle: 'split',
      sectionTitleStyle: 'smallcaps',
      bulletStyle: 'dash',
    },
    typography: {
      baseSize: 10,
      nameSize: 26,
      titleSize: 12,
      sidebarWidth: 180,
      sideSections: SIDEBAR_SECTIONS,
    },
  },
  minimal: {
    id: 'minimal',
    label: 'Minimal',
    description: 'Beaucoup d’air, des filets fins et une seule couleur sobre.',
    category: 'ats',
    atsLevel: 'optimal',
    atsNote: null,
    defaults: {
      ...BASE_TOKENS,
      palette: withPalette({ primary: '#404040', muted: '#6b6b6b', secondary: '#d4d4d4' }),
      lineHeight: 'relaxed',
      spacing: 'comfortable',
      margins: 'wide',
      sectionTitleStyle: 'plain',
      itemStyle: 'dates-below',
      bulletStyle: 'dash',
    },
    typography: {
      baseSize: 9.5,
      nameSize: 28,
      titleSize: 12,
      sidebarWidth: 180,
      sideSections: SIDEBAR_SECTIONS,
    },
  },
  ardoise: {
    id: 'ardoise',
    label: 'Ardoise',
    description: 'Colonne latérale sombre à texte clair, contact et compétences en un coup d’œil.',
    category: 'moderne',
    atsLevel: 'limite',
    atsNote: `Le modèle « Ardoise » ${COLUMNS_NOTE}`,
    defaults: {
      ...BASE_TOKENS,
      layout: 'sidebar-left',
      palette: withPalette({ primary: '#0e7490', sidebarBg: '#1f2937' }),
      fontPairing: 'poppins-inter',
      headerStyle: 'sidebar',
      sectionTitleStyle: 'underline',
      itemStyle: 'dates-below',
      skillStyle: 'dots',
      languageStyle: 'dots',
      showIcons: true,
    },
    typography: {
      baseSize: 9.5,
      nameSize: 25,
      titleSize: 12.5,
      sidebarWidth: 200,
      sideSections: SIDEBAR_SECTIONS,
    },
  },
  chronologie: {
    id: 'chronologie',
    label: 'Chronologie',
    description: 'Les dates dans une colonne, reliées par une ligne du temps.',
    category: 'moderne',
    atsLevel: 'bon',
    atsNote:
      'Les dates sont dans une colonne à part : la plupart des logiciels de recrutement les lisent bien, mais « Sobre » reste le plus sûr.',
    defaults: {
      ...BASE_TOKENS,
      palette: withPalette({ primary: '#4338ca' }),
      fontPairing: 'lora-source-sans',
      sectionTitleStyle: 'plain',
      itemStyle: 'timeline',
    },
    typography: {
      baseSize: 10,
      nameSize: 26,
      titleSize: 13,
      sidebarWidth: 180,
      sideSections: SIDEBAR_SECTIONS,
    },
  },
  duo: {
    id: 'duo',
    label: 'Duo',
    description: 'Deux colonnes égales : le parcours à gauche, les compétences à droite.',
    category: 'moderne',
    atsLevel: 'limite',
    atsNote: `Le modèle « Duo » ${COLUMNS_NOTE}`,
    defaults: {
      ...BASE_TOKENS,
      layout: 'split',
      palette: withPalette({ primary: '#0f4c5c' }),
      fontPairing: 'source',
      margins: 'narrow',
      headerStyle: 'centered',
      itemStyle: 'dates-below',
      skillStyle: 'list',
      languageStyle: 'list',
    },
    typography: {
      baseSize: 9.5,
      nameSize: 26,
      titleSize: 12.5,
      sidebarWidth: 180,
      sideSections: SIDEBAR_SECTIONS,
    },
  },
  horizon: {
    id: 'horizon',
    label: 'Horizon',
    description: 'Un bandeau coloré en tête, puis une colonne claire et aérée.',
    category: 'creatif',
    atsLevel: 'bon',
    atsNote:
      'Le bandeau coloré est lu comme du texte normal par la plupart des logiciels de recrutement ; vérifie que l’export reste lisible en noir et blanc.',
    defaults: {
      ...BASE_TOKENS,
      layout: 'banner',
      palette: withPalette({ primary: '#0f766e' }),
      fontPairing: 'montserrat-open-sans',
      headerStyle: 'band',
      sectionTitleStyle: 'bar',
      skillStyle: 'tags',
      languageStyle: 'cefr',
    },
    typography: {
      baseSize: 10,
      nameSize: 27,
      titleSize: 13,
      sidebarWidth: 180,
      sideSections: SIDEBAR_SECTIONS,
    },
  },
  creatif: {
    id: 'creatif',
    label: 'Créatif',
    description: 'Bandeau et titres en aplats de couleur, compétences en étiquettes.',
    category: 'creatif',
    atsLevel: 'limite',
    atsNote: `Le modèle « Créatif » ${COLUMNS_NOTE}`,
    defaults: {
      ...BASE_TOKENS,
      layout: 'sidebar-right',
      palette: withPalette({ primary: '#7c3aed', sidebarBg: { tint: 0.92 } }),
      fontPairing: 'poppins-inter',
      headerStyle: 'band',
      sectionTitleStyle: 'block',
      skillStyle: 'tags',
      languageStyle: 'dots',
      showIcons: true,
    },
    typography: {
      baseSize: 9.5,
      nameSize: 27,
      titleSize: 13,
      sidebarWidth: 190,
      sideSections: SIDEBAR_SECTIONS,
    },
  },
  etudiant: {
    id: 'etudiant',
    label: 'Étudiant',
    description: 'La formation et les projets d’abord, sur une page.',
    category: 'une-page',
    atsLevel: 'bon',
    atsNote: null,
    sectionOrder: STUDENT_ORDER,
    defaults: {
      ...BASE_TOKENS,
      palette: withPalette({ primary: '#2563eb' }),
      fontPairing: 'lato',
      margins: 'narrow',
      spacing: 'compact',
      sectionTitleStyle: 'underline',
      skillStyle: 'tags',
      languageStyle: 'cefr',
    },
    typography: {
      baseSize: 10,
      nameSize: 25,
      titleSize: 12.5,
      sidebarWidth: 180,
      sideSections: SIDEBAR_SECTIONS,
    },
  },
}

export const cvTemplates: Record<CvTemplateId, CvTemplateMeta> = {
  sobre: {
    id: 'sobre',
    label: 'Sobre',
    description:
      'Une colonne, titres soulignés : le plus lisible par les logiciels de recrutement.',
    category: 'ats',
    atsLevel: 'optimal',
    atsNote: null,
    defaults: {
      layout: 'single',
      palette: {
        primary: '#c8410b',
        secondary: { tint: 0 },
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
    },
    typography: {
      baseSize: 10,
      nameSize: 24,
      titleSize: 13,
      sidebarWidth: 180,
      sideSections: SIDEBAR_SECTIONS,
    },
  },
  classique: more.classique,
  executif: more.executif,
  minimal: more.minimal,
  moderne: {
    id: 'moderne',
    label: 'Moderne',
    description: 'Une colonne latérale colorée pour le contact, les compétences et les langues.',
    category: 'moderne',
    atsLevel: 'limite',
    atsNote:
      'Le modèle « Moderne » a deux colonnes : certains logiciels de recrutement (ATS) les lisent dans le désordre. Préfère « Sobre » ou « Compact » pour les candidatures en ligne.',
    defaults: {
      layout: 'sidebar-left',
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
      headerStyle: 'sidebar',
      sectionTitleStyle: 'underline',
      itemStyle: 'dates-below',
      bulletStyle: 'dot',
      skillStyle: 'list',
      languageStyle: 'list',
      showIcons: false,
    },
    typography: {
      baseSize: 9.5,
      nameSize: 24,
      titleSize: 12.5,
      sidebarWidth: 190,
      sideSections: SIDEBAR_SECTIONS,
    },
  },
  ardoise: more.ardoise,
  chronologie: more.chronologie,
  duo: more.duo,
  horizon: more.horizon,
  creatif: more.creatif,
  compact: {
    id: 'compact',
    label: 'Compact',
    description: 'Une colonne serrée, dates sur la ligne du poste : pensé pour tenir sur une page.',
    category: 'une-page',
    atsLevel: 'optimal',
    atsNote: null,
    defaults: {
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
      lineHeight: 'tight',
      spacing: 'compact',
      margins: 'narrow',
      headerStyle: 'inline',
      sectionTitleStyle: 'rule',
      itemStyle: 'compact',
      bulletStyle: 'dot',
      skillStyle: 'inline',
      languageStyle: 'inline',
      showIcons: false,
    },
    typography: {
      baseSize: 9,
      nameSize: 19,
      titleSize: 11.5,
      sidebarWidth: 170,
      sideSections: SIDEBAR_SECTIONS,
    },
  },
  etudiant: more.etudiant,
}

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
