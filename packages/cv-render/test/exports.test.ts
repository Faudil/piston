import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { cvTemplateIds } from '@piston/shared'
import { renderCvDocx } from '../src/docx'
import { formatLetterDate, renderLetterPdf, type CvLetterInput } from '../src'
import { PHOTO_DATA_URL, sampleInput } from './fixtures'
import { engine, pdfText } from './helpers'

const PARAGRAPHS = [
  'Madame, Monsieur,',
  "Passionnée par l'événementiel culturel, je souhaite rejoindre l'équipe de Théâtre de l'Œuvre.\nMon parcours à Châtelet m'a appris à piloter une saison entière.",
  'Je serais ravie de vous rencontrer.',
  'Bien cordialement,\nÉlodie Wiśniewska-Lefèvre',
]

function letterInput(templateId: (typeof cvTemplateIds)[number], design = {}): CvLetterInput {
  const { content, design: parsed } = sampleInput(templateId, design)
  return {
    content,
    design: parsed,
    templateId,
    paragraphs: PARAGRAPHS,
    recipient: { company: "Théâtre de l'Œuvre", lines: ['Service recrutement'] },
    dateLine: formatLetterDate(new Date('2026-03-03T12:00:00Z'), 'fr', 'Besançon'),
  }
}

describe('formatLetterDate', () => {
  it('writes a French and an English date line', () => {
    const date = new Date('2026-03-03T12:00:00Z')
    expect(formatLetterDate(date, 'fr', 'Paris')).toBe('Paris, le 3 mars 2026')
    expect(formatLetterDate(date, 'en')).toBe('3 March 2026')
  })
})

describe('matching cover letter PDF', () => {
  it.each(cvTemplateIds)(
    'carries the CV header and the letter text with %s',
    async (templateId) => {
      const pdf = await renderLetterPdf(letterInput(templateId), {}, engine)
      expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-')
      const text = await pdfText(pdf)
      // The CV's header block, the date, the recipient and every paragraph, accents intact.
      expect(text).toContain('Élodie Wiśniewska-Lefèvre')
      // Case-insensitive: editorial headers set the job title in capitals.
      expect(text.toLowerCase()).toContain('chargée de communication événementielle')
      expect(text).toContain('elodie@example.com')
      expect(text).toContain('Besançon, le 3 mars 2026')
      expect(text).toContain("Théâtre de l'Œuvre")
      expect(text).toContain("Passionnée par l'événementiel culturel")
      expect(text).toContain('Bien cordialement,')
    },
  )

  it('keeps the CV palette and fonts', async () => {
    const pdf = await renderLetterPdf(
      letterInput('sobre', { fontPairing: 'eb-garamond' }),
      {},
      engine,
    )
    const raw = Buffer.from(pdf).toString('latin1')
    expect(raw).toMatch(/EBGaramond/)
  })

  it('flows a long letter onto a second page', async () => {
    const input = letterInput('sobre')
    input.paragraphs = Array.from(
      { length: 30 },
      (_, i) => `Paragraphe ${i + 1}. ${'Texte '.repeat(60)}`,
    )
    const text = await pdfText(await renderLetterPdf(input, {}, engine))
    expect(text).toContain('Paragraphe 30.')
    expect(text.split('\n\n').length).toBeGreaterThan(1)
  })
})

async function documentXml(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  return zip.file('word/document.xml')!.async('string')
}

describe('Word export', () => {
  it('is a zip whose document.xml holds the name, an experience title and its bullets', async () => {
    const bytes = await renderCvDocx(sampleInput('sobre'))
    // A .docx is a zip: local file header signature « PK ».
    expect(Buffer.from(bytes).subarray(0, 2).toString()).toBe('PK')
    const xml = await documentXml(bytes)
    expect(xml).toContain('Élodie Wiśniewska-Lefèvre')
    expect(xml).toContain('Chargée de communication')
    expect(xml).toContain('Théâtre du Châtelet')
    expect(xml).toContain('Pilotage de la communication de 12 spectacles par saison')
    // Real headings and bullets, not styled plain paragraphs.
    expect(xml).toContain('w:val="Heading2"')
    expect(xml).toContain('<w:numPr>')
  })

  it('uses a two-column table only for a sidebar layout', async () => {
    const single = await documentXml(await renderCvDocx(sampleInput('sobre')))
    expect(single).not.toContain('<w:tbl>')
    const sidebar = await documentXml(
      await renderCvDocx(sampleInput('sobre', { layout: 'sidebar-left' })),
    )
    expect(sidebar).toContain('<w:tbl>')
    expect(sidebar).toContain('Élodie Wiśniewska-Lefèvre')
  })

  it('names the fonts and colors of the design', async () => {
    const zip = await JSZip.loadAsync(
      await renderCvDocx(
        sampleInput('sobre', { fontPairing: 'eb-garamond', palette: { primary: '#0e7490' } }),
      ),
    )
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('w:ascii="EB Garamond"')
    expect(xml).toContain('0E7490')
  })

  it('draws the accent on headings, the section title style and rated skills as text', async () => {
    const input = sampleInput('ardoise', {
      palette: { primary: '#0e7490' },
      sectionTitleStyle: 'block',
    })
    input.content.skills[0]!.items[0]!.level = 4
    const xml = await documentXml(await renderCvDocx(input))
    // The block style fills the heading with the accent.
    expect(xml).toMatch(/<w:shd [^>]*w:fill="0E7490"/)
    expect(xml).toContain('●●●●○')
    expect(xml).toContain('w:val="Heading2"')
    const rule = await documentXml(
      await renderCvDocx(sampleInput('sobre', { sectionTitleStyle: 'smallcaps' })),
    )
    expect(rule).toContain('<w:smallCaps')
  })

  it('embeds the photo only when there is one, and centers a centered header', async () => {
    const photoId = '00000000-0000-4000-8000-000000000001'
    const input = sampleInput('classique')
    expect(Object.keys((await JSZip.loadAsync(await renderCvDocx(input))).files)).not.toContain(
      'word/media/',
    )
    input.content.header.photo = {
      assetId: photoId,
      shape: 'round',
      size: 'm',
      position: 'left',
      visible: true,
    }
    const bytes = await renderCvDocx(input, { images: { [photoId]: PHOTO_DATA_URL } })
    const zip = await JSZip.loadAsync(bytes)
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(true)
    // « Classique » has a centered header.
    expect(await documentXml(bytes)).toContain('<w:jc w:val="center"/>')
    // A WebP or missing image is left out rather than breaking the export.
    const without = await renderCvDocx(input, {
      images: { [photoId]: 'data:image/webp;base64,UklGRg==' },
    })
    expect(
      Object.keys((await JSZip.loadAsync(without)).files).some(
        (n) => n.startsWith('word/media/') && !n.endsWith('/'),
      ),
    ).toBe(false)
  })

  it.each(cvTemplateIds)('builds %s', async (templateId) => {
    const xml = await documentXml(await renderCvDocx(sampleInput(templateId)))
    expect(xml).toContain('Élodie')
  })
})
