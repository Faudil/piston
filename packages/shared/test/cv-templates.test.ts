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
  CV_SAMPLE_PHOTO_ASSET_ID,
  cvSampleAssets,
  cvTemplateSampleContent,
  ensureContrast,
  isTwoColumnLayout,
  tintColor,
  readableOn,
  resolveCvDesign,
  cvSectionTitleStyles,
  cvSectionTitleStyleLabels,
} from '../src'

describe('template catalog', () => {
  it('has eighteen templates with unique labels, in every category, in gallery order', () => {
    expect(cvTemplateIds).toHaveLength(18)
    const labels = cvTemplateIds.map((id) => cvTemplates[id].label)
    expect(new Set(labels).size).toBe(18)
    for (const category of cvTemplateCategories) {
      expect(
        cvTemplateIds.filter((id) => cvTemplates[id].category === category).length,
        category,
      ).toBeGreaterThanOrEqual(2)
    }
    // ATS first, then modern, creative, one-page: the gallery shows them in this order.
    const ranks = cvTemplateIds.map((id) => cvTemplateCategories.indexOf(cvTemplates[id].category))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('keeps « Sobre » and « Compact » strictly plain', () => {
    for (const id of ['sobre', 'compact'] as const) {
      const { defaults, typography, atsLevel, photo } = cvTemplates[id]
      expect(atsLevel, id).toBe('optimal')
      expect(photo, id).toBe('none')
      expect(defaults.layout, id).toBe('single')
      expect(defaults.showIcons, id).toBe(false)
      expect(defaults.skillStyle, id).toBe('inline')
      expect(defaults.languageStyle, id).toBe('inline')
      expect(['left', 'inline'], id).toContain(defaults.headerStyle)
      expect(typography.ornament ?? 'none', id).toBe('none')
    }
  })

  it('looks different from one template to the next', () => {
    // No two templates share their accent, layout and font pairing all at once.
    const looks = cvTemplateIds.map((id) => {
      const { defaults } = cvTemplates[id]
      return `${defaults.palette.primary}|${defaults.layout}|${defaults.fontPairing}`
    })
    expect(new Set(looks).size).toBe(looks.length)
    // Most templates show icons or gauges somewhere, a few stay plain.
    const expressive = cvTemplateIds.filter((id) => {
      const { defaults } = cvTemplates[id]
      return (
        defaults.showIcons ||
        ['bars', 'dots', 'tags'].includes(defaults.skillStyle) ||
        ['bars', 'dots'].includes(defaults.languageStyle)
      )
    })
    expect(expressive.length).toBeGreaterThanOrEqual(10)
    expect(cvTemplateIds.filter((id) => cvTemplates[id].photo === 'feature').length).toBe(3)
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
      // Decorative shapes may sit behind text: their lightest-but-one tint keeps 4.5:1.
      const { typography } = cvTemplates[id]
      if ((typography.ornament ?? 'none') !== 'none') {
        const shape = tintColor(palette.primary, 0.82)
        for (const color of [palette.text, palette.muted]) {
          expect(contrastRatio(color, shape), `${id} text on ornament`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  it('keeps every new primary color readable whatever shapes and bands it fills', () => {
    // Any accent: the shapes' tint still carries the darkest body text and the muted gray.
    for (const primary of ['#000000', '#7c3aed', '#ffeb3b', '#c026d3', '#0e7490']) {
      const shape = tintColor(primary, 0.82)
      expect(contrastRatio('#57534e', shape), primary).toBeGreaterThanOrEqual(4.5)
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
    expect(sample.skills.flatMap((group) => group.items).every((skill) => skill.level > 0)).toBe(
      true,
    )
    expect(sample.languages.every((language) => language.cefr)).toBe(true)
  })

  it('has a generated photo placeholder, dropped for plain templates', () => {
    const sample = cvSampleContent()
    expect(sample.header.photo?.assetId).toBe(CV_SAMPLE_PHOTO_ASSET_ID)
    const image = cvSampleAssets().images[CV_SAMPLE_PHOTO_ASSET_ID]!
    expect(image).toMatch(/^data:image\/png;base64,/)
    const bytes = Buffer.from(image.split(',')[1]!, 'base64')
    // A real PNG (the renderer embeds PNG and JPEG only), small enough for every thumbnail.
    expect(bytes.subarray(1, 4).toString()).toBe('PNG')
    expect(bytes.length).toBeLessThan(8000)
    for (const id of cvTemplateIds) {
      const content = cvTemplateSampleContent(cvTemplates[id])
      expect(Boolean(content.header.photo), id).toBe(cvTemplates[id].photo !== 'none')
    }
    expect(cvTemplateSampleContent(cvTemplates.etudiant).sections[1]!.key).toBe('education')
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
