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

/**
 * CV templates: metadata and default design tokens. A template is data, in
 * this file, because the browser (gallery, design panel, live checks), the
 * API (validation) and the renderer all need it. The renderer
 * (`@piston/cv-render`) turns the resolved tokens into a PDF; no template
 * has code of its own. See CONTRIBUTING.md (« Adding a CV template »).
 */

export const cvTemplateIds = ['sobre', 'moderne', 'compact'] as const
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
}

/** Mixes a #rrggbb color with white: 0 = the color, 1 = white. */
export function tintColor(hex: string, amount: number): string {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16))
  return `#${channels
    .map((channel) => Math.round(channel + (255 - channel) * amount))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
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
export function isTwoColumnLayout(layout: CvLayout): boolean {
  return layout === 'sidebar-left' || layout === 'sidebar-right' || layout === 'split'
}
