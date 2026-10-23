import {
  cvFontPairings,
  ensureContrast,
  readableOn,
  type CvLineHeight,
  type CvMargins,
  type CvPageFormat,
  type CvSpacing,
  type ResolvedCvDesign,
} from '@piston/shared'
import { cvFontFamilyName } from '../fonts'

/**
 * Numeric design tokens: what the blocks draw with, computed once per render
 * from the resolved design. Every size and gap of every template comes from
 * here, so the design controls (font size step, spacing, margins, line
 * height) act on all templates the same way.
 */

/** Page sizes in PDF points. */
export const PAGE_SIZES: Record<CvPageFormat, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
}

/** Vertical gaps are multiplied by this (v1 « densité »: 1.3 / 1 / 0.72). */
const SPACING_FACTORS: Record<CvSpacing, number> = { compact: 0.72, normal: 1, comfortable: 1.3 }

const LINE_HEIGHTS: Record<CvLineHeight, number> = { tight: 1.15, normal: 1.2, relaxed: 1.32 }

/** Page margins in points: left/right, top, bottom. */
const MARGINS: Record<CvMargins, { x: number; top: number; bottom: number }> = {
  narrow: { x: 40, top: 32, bottom: 30 },
  normal: { x: 50, top: 44, bottom: 40 },
  wide: { x: 64, top: 54, bottom: 48 },
}

/** Each font size step is ±6 % of the template's sizes. */
const FONT_STEP = 0.06

export interface CvTokens {
  design: ResolvedCvDesign
  page: { width: number; height: number }
  margins: { x: number; top: number; bottom: number }
  fonts: { heading: string; body: string }
  colors: ResolvedCvDesign['palette'] & {
    onPrimary: string
    /** The primary color for text on the page background: darkened until it reads (4.5:1). */
    primaryText: string
  }
  lineHeight: number
  /** Font sizes in points. */
  size: {
    base: number
    small: number
    meta: number
    itemTitle: number
    sectionTitle: number
    sideSectionTitle: number
    side: number
    name: number
    title: number
    contact: number
  }
  /** A vertical gap of `points` at normal spacing, scaled to the design's spacing. */
  space(points: number): number
}

const round = (value: number) => Math.round(value * 10) / 10

export { readableOn }

export function computeTokens(design: ResolvedCvDesign): CvTokens {
  const factor = 1 + FONT_STEP * design.fontSize
  const { baseSize, nameSize, titleSize } = design.typography
  const size = (points: number) => round(points * factor)
  const spacing = SPACING_FACTORS[design.spacing]
  const pairing = cvFontPairings[design.fontPairing]
  return {
    design,
    page: PAGE_SIZES[design.pageFormat],
    margins: MARGINS[design.margins],
    fonts: { heading: cvFontFamilyName(pairing.heading), body: cvFontFamilyName(pairing.body) },
    colors: {
      ...design.palette,
      onPrimary: readableOn(design.palette.primary),
      primaryText: ensureContrast(design.palette.primary, '#ffffff'),
    },
    lineHeight: LINE_HEIGHTS[design.lineHeight],
    size: {
      base: size(baseSize),
      small: size(baseSize * 0.95),
      meta: size(baseSize * 0.9),
      itemTitle: size(baseSize * 1.05),
      sectionTitle: size(baseSize * 1.06),
      sideSectionTitle: size(baseSize),
      side: size(baseSize * 0.95),
      name: size(nameSize),
      title: size(titleSize),
      contact: size(baseSize * 0.95),
    },
    space: (points: number) => round(points * spacing),
  }
}
