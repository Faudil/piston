import { describe, expect, it } from 'vitest'
import {
  CvContent,
  CvDesign,
  applyTemplateSectionOrder,
  contrastRatio,
  cvPalettes,
  cvSampleContent,
  cvTemplateCategories,
  cvTemplateIds,
  cvTemplates,
  ensureContrast,
  isTwoColumnLayout,
  readableOn,
  resolveCvDesign,
  cvSectionTitleStyles,
  cvSectionTitleStyleLabels,
} from '../src'

describe('template catalog', () => {
  it('has twelve templates with unique labels, in every category', () => {
    expect(cvTemplateIds).toHaveLength(12)
    const labels = cvTemplateIds.map((id) => cvTemplates[id].label)
    expect(new Set(labels).size).toBe(12)
    for (const category of cvTemplateCategories) {
      expect(
        cvTemplateIds.some((id) => cvTemplates[id].category === category),
        category,
      ).toBe(true)
    }
  })

  it('describes each template honestly for ATS readers', () => {
    for (const id of cvTemplateIds) {
      const template = cvTemplates[id]
      expect(template.id).toBe(id)
      expect(template.description.length, id).toBeGreaterThan(20)
      // Columns can be read out of order: never « optimal », and the note says so.
      if (isTwoColumnLayout(template.defaults.layout)) {
        expect(template.atsLevel, id).toBe('limite')
      }
      if (template.atsLevel === 'limite') expect(template.atsNote, id).toBeTruthy()
      if (template.atsLevel === 'optimal') expect(template.defaults.layout, id).toBe('single')
    }
  })

  it('keeps text readable: contrast of every default color pair is at least 4.5:1', () => {
    for (const id of cvTemplateIds) {
      const palette = resolveCvDesign(cvTemplates[id], CvDesign.parse({})).palette
      expect(contrastRatio(palette.text, '#ffffff'), `${id} text`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(palette.muted, '#ffffff'), `${id} muted`).toBeGreaterThanOrEqual(4.5)
      // Text on the primary color (header band, block titles).
      expect(
        contrastRatio(readableOn(palette.primary), palette.primary),
        `${id} on primary`,
      ).toBeGreaterThanOrEqual(4.5)
      // Text on the side column.
      expect(
        contrastRatio(readableOn(palette.sidebarBg), palette.sidebarBg),
        `${id} on side`,
      ).toBeGreaterThanOrEqual(4.5)
      // The accent as text, on the page and on the side column.
      for (const background of ['#ffffff', palette.sidebarBg]) {
        expect(
          contrastRatio(ensureContrast(palette.primary, background), background),
          `${id} accent on ${background}`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('offers palettes that stay readable with any template', () => {
    expect(cvPalettes.length).toBeGreaterThanOrEqual(8)
    for (const palette of cvPalettes) {
      for (const color of [palette.primary, palette.secondary, palette.sidebarBg]) {
        expect(color, palette.id).toMatch(/^#[0-9a-f]{6}$/)
      }
      expect(contrastRatio(palette.primary, '#ffffff'), palette.id).toBeGreaterThanOrEqual(4.5)
      expect(
        contrastRatio(readableOn(palette.primary), palette.primary),
        palette.id,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('ensureContrast moves a color towards black or white, keeping it unchanged when it passes', () => {
    expect(ensureContrast('#1c1917', '#ffffff')).toBe('#1c1917')
    expect(contrastRatio(ensureContrast('#ffeb3b', '#ffffff'), '#ffffff')).toBeGreaterThanOrEqual(
      4.5,
    )
    expect(contrastRatio(ensureContrast('#0e7490', '#1f2937'), '#1f2937')).toBeGreaterThanOrEqual(
      4.5,
    )
  })

  it('labels every section title style', () => {
    for (const style of cvSectionTitleStyles) expect(cvSectionTitleStyleLabels[style]).toBeTruthy()
  })
})

describe('sample CV and section order', () => {
  it('is a valid, deterministic French document', () => {
    const sample = cvSampleContent()
    expect(CvContent.safeParse(sample).success).toBe(true)
    expect(JSON.stringify(cvSampleContent())).toBe(JSON.stringify(sample))
    expect(sample.header.fullName).toBe('Léa Marchand')
    expect(sample.skills[0]!.items[0]!.level).toBeGreaterThan(0)
  })

  it('applies a recommended order only for templates that have one', () => {
    const sample = cvSampleContent()
    expect(applyTemplateSectionOrder(sample, cvTemplates.sobre)).toBe(sample)
    const student = applyTemplateSectionOrder(sample, cvTemplates.etudiant)
    const keys = student.sections.map((section) => section.key)
    expect(keys.indexOf('education')).toBeLessThan(keys.indexOf('experiences'))
    expect(keys.indexOf('projects')).toBeLessThan(keys.indexOf('experiences'))
    expect(keys.slice().sort()).toEqual(sample.sections.map((section) => section.key).sort())
    // The input is not mutated.
    expect(sample.sections.map((section) => section.key).indexOf('experiences')).toBeLessThan(
      sample.sections.map((section) => section.key).indexOf('education'),
    )
  })
})
