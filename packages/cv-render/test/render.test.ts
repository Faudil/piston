import { statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CvContent,
  applyTemplateSectionOrder,
  cvSampleContent,
  cvTemplates,
  createCvItem,
  cvBulletStyles,
  cvFontFamilies,
  cvFontPairingIds,
  cvHeaderStyles,
  cvItemStyles,
  cvLanguageStyles,
  cvLayouts,
  cvSectionTitleStyles,
  cvSkillStyles,
  cvTemplateIds,
} from '@piston/shared'
import {
  cvContentId,
  cvFontFiles,
  cvPairingFamilies,
  parseCvContentId,
  render,
  renderPdf,
  type CvRenderResult,
} from '../src'
import { CV_FONTS_DIR } from '../src/node'
import {
  PHOTO_DATA_URL,
  longContent,
  nearlyEmptyContent,
  sampleContent,
  sampleInput,
  stressContent,
} from './fixtures'
import { engine, pdfText } from './helpers'

const PHOTO_ID = '00000000-0000-4000-8000-000000000001'
const assets = { images: { [PHOTO_ID]: PHOTO_DATA_URL } }

const raw = (result: CvRenderResult) => Buffer.from(result.pdf).toString('latin1')

/** Text with line breaks and runs of spaces collapsed: wrapping depends on the layout. */
const squash = (text: string) => text.replace(/-\n/g, '-').replace(/\s+/g, ' ')
const flat = async (result: CvRenderResult) => squash(await pdfText(result.pdf))

function withPhoto(content: CvContent, shape: 'round' | 'rounded' | 'square' = 'round'): CvContent {
  content.header.photo = { assetId: PHOTO_ID, shape, size: 'm', position: 'left', visible: true }
  return content
}

describe('render', () => {
  it('is pure: same input, same definition, input untouched', () => {
    const input = sampleInput('moderne')
    const before = JSON.stringify(input)
    expect(JSON.stringify(render(input))).toBe(JSON.stringify(render(input)))
    expect(JSON.stringify(input)).toBe(before)
  })

  it('sets the page size, metadata and fonts from the design', () => {
    const definition = render(sampleInput('sobre', { pageFormat: 'Letter', language: 'en' }))
    expect(definition.pageSize).toEqual({ width: 612, height: 792 })
    expect(definition.language).toBe('en-GB')
    expect(definition.info?.title).toBe('CV — Élodie Wiśniewska-Lefèvre')
    expect(definition.defaultStyle?.font).toBe('Inter')
  })
})

describe('renderPdf', () => {
  it('renders every template with real, extractable text', async () => {
    for (const templateId of cvTemplateIds) {
      const result = await renderPdf(sampleInput(templateId), {}, engine)
      expect(raw(result).startsWith('%PDF-')).toBe(true)
      expect(raw(result)).toContain('/FontFile2')
      expect(result.pageCount).toBeLessThanOrEqual(2)
      expect(result.pageSize).toEqual({ width: 595.28, height: 841.89 })
      const text = await pdfText(result.pdf)
      const squashed = squash(text)
      for (const expected of [
        'Élodie Wiśniewska-Lefèvre',
        'Besançon',
        'Théâtre du Châtelet',
        'Œuvre à « faire connaître »',
        'd’expérience',
        'Canva',
      ]) {
        expect(squashed).toContain(expected)
      }
      // The name is what an ATS reads first, whatever the layout.
      expect(text.indexOf('Élodie')).toBe(0)
    }
  })

  it('renders every layout, the name first and the columns in a sensible order', async () => {
    for (const layout of cvLayouts) {
      const result = await renderPdf(sampleInput('sobre', { layout }), {}, engine)
      const text = await pdfText(result.pdf)
      expect(text.indexOf('Élodie'), layout).toBe(0)
      expect(text).toContain('EXPÉRIENCE PROFESSIONNELLE')
      expect(text).toContain('COMPÉTENCES')
      if (layout === 'sidebar-left') {
        // The side column is drawn first, the main column after.
        expect(text.indexOf('COMPÉTENCES')).toBeLessThan(text.indexOf('EXPÉRIENCE'))
      }
      if (layout === 'sidebar-right' || layout === 'split') {
        expect(text.indexOf('EXPÉRIENCE')).toBeLessThan(text.indexOf('COMPÉTENCES'))
      }
    }
  })

  it('prints Latin Extended letters in every font pairing', async () => {
    const content = sampleContent()
    content.experiences[0]!.bullets[0]!.text = 'Zażółć gęślą jaźń · Şişli · Dvořák · Őrség'
    for (const fontPairing of cvFontPairingIds) {
      const result = await renderPdf(sampleInput('sobre', { fontPairing }, content), {}, engine)
      const text = await pdfText(result.pdf)
      expect(text, fontPairing).toContain('Zażółć gęślą jaźń · Şişli · Dvořák · Őrség')
      expect(text, fontPairing).toContain('Wiśniewska')
    }
  })

  it('renders every style without error', async () => {
    const content = withPhoto(sampleContent())
    content.skills[0]!.items[0]!.level = 4
    content.languages[0]!.cefr = 'C1'
    const variants: Array<Record<string, unknown>> = [
      ...cvHeaderStyles.map((headerStyle) => ({ headerStyle, showIcons: true })),
      ...cvSectionTitleStyles.map((sectionTitleStyle) => ({ sectionTitleStyle, showIcons: true })),
      ...cvItemStyles.map((itemStyle) => ({ itemStyle })),
      ...cvBulletStyles.map((bulletStyle) => ({ bulletStyle })),
      ...cvSkillStyles.map((skillStyle) => ({ skillStyle, layout: 'sidebar-left' })),
      ...cvSkillStyles.map((skillStyle) => ({ skillStyle })),
      ...cvLanguageStyles.map((languageStyle) => ({ languageStyle, layout: 'split' })),
      ...cvLanguageStyles.map((languageStyle) => ({ languageStyle })),
      { lineHeight: 'relaxed', spacing: 'comfortable', margins: 'wide', fontSize: 2 },
      { lineHeight: 'tight', spacing: 'compact', margins: 'narrow', fontSize: -2 },
      { palette: { primary: '#111111', sidebarBg: '#1f2937' }, layout: 'sidebar-right' },
    ]
    for (const design of variants) {
      const result = await renderPdf(sampleInput('sobre', design, content), assets, engine)
      expect(await flat(result), JSON.stringify(design)).toContain('Théâtre du Châtelet')
    }
  })

  it('embeds the photo in each shape, and only PNG or JPEG data URLs', async () => {
    for (const shape of ['round', 'rounded', 'square'] as const) {
      const result = await renderPdf(
        sampleInput('sobre', {}, withPhoto(sampleContent(), shape)),
        assets,
        engine,
      )
      expect(raw(result)).toMatch(/\/Subtype \/Image/)
      expect(result.boxes.some((box) => box.id === cvContentId.photo)).toBe(true)
    }
    const webp = await renderPdf(
      sampleInput('sobre', {}, withPhoto(sampleContent())),
      { images: { [PHOTO_ID]: 'data:image/webp;base64,UklGRg==' } },
      engine,
    )
    expect(raw(webp)).not.toMatch(/\/Subtype \/Image/)
    const missing = await renderPdf(
      sampleInput('sobre', {}, withPhoto(sampleContent())),
      {},
      engine,
    )
    expect(missing.boxes.some((box) => box.id === cvContentId.photo)).toBe(false)
  })

  it('makes contact details and links clickable, nothing else', async () => {
    const content = sampleContent()
    content.header.links.push({ id: 'l2', label: 'Script', url: 'javascript:alert(1)' })
    const result = await renderPdf(sampleInput('sobre', { showIcons: true }, content), {}, engine)
    expect(raw(result)).toContain('mailto:elodie@example.com')
    expect(raw(result)).toContain('tel:0612345678')
    expect(raw(result)).toContain('https://linkedin.com/in/elodie-lefevre')
    expect(raw(result)).not.toContain('javascript:')
  })

  it('removes what the fonts cannot print', async () => {
    const content = sampleContent()
    content.summary = 'Créative 🚀 et rigoureuse'
    const text = await flat(await renderPdf(sampleInput('sobre', {}, content), {}, engine))
    expect(text).toContain('Créative et rigoureuse')
    expect(text).not.toContain('🚀')
  })

  it('renders the v2 sections, custom sections and references on request', async () => {
    const content = sampleContent()
    content.volunteering.push(
      createCvItem('volunteering', {
        title: 'Bénévole',
        organization: 'Restos du Cœur',
        bullets: ['Distribution'],
      }),
    )
    content.awards.push(createCvItem('awards', { name: 'Prix Jeune Talent', issuer: 'Ville' }))
    content.publications.push(createCvItem('publications', { title: 'La médiation numérique' }))
    content.extras.push(createCvItem('extras', { text: 'Permis B' }))
    content.referencesAvailableOnRequest = true
    content.custom.push({
      id: 'c1',
      title: 'Expositions',
      items: [{ id: 'ci1', title: 'Regards', subtitle: 'Galerie Nord', date: '2023', text: '' }],
    })
    for (const key of ['volunteering', 'awards', 'publications', 'references', 'extras'] as const) {
      content.sections.find((section) => section.key === key)!.visible = true
    }
    const parsed = CvContent.parse(content)
    for (const layout of ['single', 'sidebar-left'] as const) {
      const text = await flat(await renderPdf(sampleInput('sobre', { layout }, parsed), {}, engine))
      for (const expected of [
        'BÉNÉVOLAT',
        'Restos du Cœur',
        'PRIX ET DISTINCTIONS',
        'La médiation numérique',
        'Références disponibles sur demande',
        'Permis B',
        'EXPOSITIONS',
        'Galerie Nord',
      ]) {
        expect(text, `${layout}: ${expected}`).toContain(expected)
      }
    }
  })
})

describe('layout results', () => {
  it('reports content boxes on the page, nested as the content is', async () => {
    const result = await renderPdf(sampleInput('moderne'), {}, engine)
    const byId = new Map(result.boxes.map((box) => [box.id, box]))
    for (const id of [
      cvContentId.header('fullName'),
      cvContentId.header('title'),
      cvContentId.header('email'),
      cvContentId.summary,
      cvContentId.section('experiences'),
      cvContentId.item('e1'),
      cvContentId.item('e2'),
      cvContentId.bullet('b1'),
      cvContentId.item('s1'),
    ]) {
      expect(byId.has(id), id).toBe(true)
      expect(parseCvContentId(id)).not.toBeNull()
    }
    for (const box of result.boxes) {
      expect(box.page).toBe(1)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(result.pageSize.width)
      expect(box.y + box.height).toBeLessThanOrEqual(result.pageSize.height)
      expect(box.width).toBeGreaterThan(0)
      expect(box.height).toBeGreaterThan(0)
    }
    // A bullet lies inside its item, the item below its section title.
    const item = byId.get(cvContentId.item('e1'))!
    const bullet = byId.get(cvContentId.bullet('b1'))!
    const title = byId.get(cvContentId.section('experiences'))!
    expect(bullet.y).toBeGreaterThan(item.y)
    expect(bullet.y + bullet.height).toBeLessThanOrEqual(item.y + item.height + 0.5)
    expect(title.y + title.height).toBeLessThanOrEqual(item.y + 0.5)
    // The sidebar's skills are left of the main column.
    expect(byId.get(cvContentId.item('s1'))!.x).toBeLessThan(item.x)
  })

  it('counts pages, keeps section titles with their first item, and measures the last page', async () => {
    const content = sampleContent()
    content.experiences = Array.from({ length: 14 }, (_, index) =>
      createCvItem('experiences', {
        title: `Poste ${index}`,
        organization: 'Entreprise',
        start: '2020',
        end: '2021',
        bullets: Array.from({ length: 4 }, (_, bullet) => `Réalisation ${bullet} `.repeat(6)),
      }),
    )
    const result = await renderPdf(sampleInput('sobre', {}, content), {}, engine)
    expect(result.pageCount).toBeGreaterThan(2)
    expect(result.lastPageFill).toBeGreaterThan(0)
    expect(result.lastPageFill).toBeLessThanOrEqual(1)
    const text = await pdfText(result.pdf)
    expect(text).toContain('Poste 13')
    // Every section title shares its page with the start of its first item.
    const pagesOf = (id: string) =>
      result.boxes.filter((box) => box.id === id).map((box) => box.page)
    for (const [section, first] of [
      ['education', 'd1'],
      ['skills', 's1'],
      ['certifications', 'c1'],
      ['projects', 'p1'],
    ] as const) {
      expect(pagesOf(cvContentId.item(first))[0], section).toBe(
        pagesOf(cvContentId.section(section))[0],
      )
    }
    // An item taller than a page has a box on each page it covers.
    const huge = sampleContent()
    huge.experiences[0]!.bullets = Array.from({ length: 12 }, (_, index) => ({
      id: `h${index}`,
      text: `${'é'.repeat(380)} ${index}`,
    }))
    const tall = await renderPdf(sampleInput('sobre', {}, huge), {}, engine)
    expect(tall.boxes.filter((box) => box.id === cvContentId.item('e1')).length).toBeGreaterThan(1)

    const short = await renderPdf(sampleInput('compact'), {}, engine)
    expect(short.pageCount).toBe(1)
    expect(short.lastPageFill).toBeLessThan(0.9)
  })
})

describe('fonts', () => {
  it('ships every file of every family, with a license, at a reasonable size', () => {
    let total = 0
    for (const file of cvFontFiles()) {
      total += statSync(CV_FONTS_DIR + file).size
    }
    for (const family of cvFontFamilies) {
      expect(statSync(`${CV_FONTS_DIR}LICENSE-${family}.txt`).size).toBeGreaterThan(1000)
    }
    // All pairings together; the browser loads one pairing (one or two families) at a time.
    expect(total).toBeLessThan(2_000_000)
    for (const pairing of cvFontPairingIds) {
      expect(cvPairingFamilies(pairing).length).toBeGreaterThan(0)
    }
  })
})

describe('the twelve templates', () => {
  const photoContent = () => withPhoto(cvSampleContent())
  const fixturesByName: Record<string, () => CvContent> = {
    demo: cvSampleContent,
    long: longContent,
    empty: nearlyEmptyContent,
    photo: photoContent,
    stress: stressContent,
  }

  it('has twelve templates', () => {
    expect(cvTemplateIds).toHaveLength(12)
  })

  for (const templateId of cvTemplateIds) {
    describe(templateId, () => {
      it('renders the demo CV on one or two pages, name first, sections in order', async () => {
        const result = await renderPdf(sampleInput(templateId, {}, cvSampleContent()), {}, engine)
        expect(result.pageCount).toBeLessThanOrEqual(2)
        const text = squash(await pdfText(result.pdf))
        expect(text.indexOf('Léa Marchand')).toBe(0)
        // The reading order: profile, experience, then the rest, whatever the layout.
        const at = (needle: string) => text.toUpperCase().indexOf(needle)
        expect(at('PROFIL')).toBeGreaterThan(-1)
        expect(at('PROFIL')).toBeLessThan(at('EXPÉRIENCE PROFESSIONNELLE'))
        expect(at('EXPÉRIENCE PROFESSIONNELLE')).toBeLessThan(at('FORMATION'))
        for (const expected of [
          'Cheffe de projet digital',
          'lea.marchand@exemple.fr',
          'Atelier Rhône Numérique',
          'Université Lumière Lyon 2',
          'Espagnol',
        ]) {
          expect(text, expected).toContain(expected)
        }
      })

      it('handles a long CV, a nearly empty one, a photo and very long strings', async () => {
        for (const [name, make] of Object.entries(fixturesByName)) {
          const result = await renderPdf(sampleInput(templateId, {}, make()), assets, engine)
          const text = await flat(result)
          expect(raw(result).startsWith('%PDF-'), name).toBe(true)
          if (name === 'long') expect(result.pageCount, name).toBeGreaterThanOrEqual(2)
          if (name === 'empty') {
            expect(result.pageCount, name).toBe(1)
            expect(text, name).toContain('Marie Petit')
          }
          if (name === 'stress') {
            expect(text, name).toContain('Zażółć gęślą jaźń')
            expect(text, name).toContain('Wojciechowska')
            expect(text, name).toContain('Supercalifragilistic')
          }
          if (name === 'photo') expect(raw(result), name).toMatch(/\/Subtype \/Image/)
        }
      })

      it('prints accents and typographic characters in every font pairing it can be given', async () => {
        const content = cvSampleContent()
        content.summary = 'Œuvre « à l’écoute » — Ça va, être là ; naïve, coûteux !'
        for (const fontPairing of ['lato', 'eb-garamond'] as const) {
          const result = await renderPdf(
            sampleInput(templateId, { fontPairing }, content),
            {},
            engine,
          )
          expect(await flat(result)).toContain('Œuvre « à l’écoute »')
        }
      })
    })
  }

  it('puts « Étudiant » sections in the order the template recommends, only at creation', () => {
    const content = applyTemplateSectionOrder(cvSampleContent(), cvTemplates.etudiant)
    const keys = content.sections.map((section) => section.key)
    expect(keys.indexOf('education')).toBeLessThan(keys.indexOf('experiences'))
    expect(keys.indexOf('projects')).toBeLessThan(keys.indexOf('experiences'))
  })

  it('draws the timeline, small capitals and tags on a dark column readably', async () => {
    const result = await renderPdf(
      sampleInput('chronologie', { sectionTitleStyle: 'smallcaps' }, cvSampleContent()),
      {},
      engine,
    )
    expect((await flat(result)).toUpperCase()).toContain('EXPÉRIENCE PROFESSIONNELLE')
    const dark = await renderPdf(
      sampleInput(
        'ardoise',
        { skillStyle: 'tags', palette: { primary: '#ffeb3b' } },
        cvSampleContent(),
      ),
      {},
      engine,
    )
    expect(await flat(dark)).toContain('Scrum et Kanban')
  })
})
