import { describe, expect, it } from 'vitest'
import {
  CV_LIMITS,
  CvContent,
  CvDesign,
  checkCv,
  createBlankCv,
  createCvItem,
  cvDefaultVisibleSections,
  cvSectionKeys,
  cvToMarkdown,
  cvToText,
  draftToContent,
  estimateCvPages,
  formatCvDateRange,
  newCvId,
  normalizeSections,
  stripUnprintable,
  unprintableCharacters,
  type CvDraftOutput,
} from '../src'
import { sampleCv } from './cv-fixture'

const design = CvDesign.parse({})

describe('CvContent', () => {
  it('fills a blank document with every section in the default order, the v1 ones visible', () => {
    const cv = createBlankCv('Camille')
    expect(cv.version).toBe(2)
    expect(cv.header.fullName).toBe('Camille')
    expect(cv.header.photo).toBeNull()
    expect(cv.sections.map((s) => s.key)).toEqual([...cvSectionKeys])
    expect(cv.sections.every((s) => s.title === '' && s.column === 'auto')).toBe(true)
    expect(cv.sections.filter((s) => s.visible).map((s) => s.key)).toEqual([
      ...cvDefaultVisibleSections,
    ])
    expect(cv.experiences).toEqual([])
  })

  it('normalizes the section list: duplicates dropped, missing keys appended', () => {
    const sections = normalizeSections([
      { key: 'skills', title: 'Savoir-faire', visible: false, column: 'side' },
      { key: 'skills', title: '', visible: true, column: 'auto' },
      { key: 'summary', title: '', visible: true, column: 'auto' },
    ])
    expect(sections).toHaveLength(cvSectionKeys.length)
    expect(sections[0]).toEqual({
      key: 'skills',
      title: 'Savoir-faire',
      visible: false,
      column: 'side',
    })
    expect(sections[1]!.key).toBe('summary')
    expect(sections.slice(2).map((s) => s.key)).toEqual(
      cvSectionKeys.filter((key) => key !== 'skills' && key !== 'summary'),
    )
  })

  it('accepts half-typed dates but bounds every length and count', () => {
    const cv = sampleCv()
    cv.experiences[0]!.start = '03/20'
    expect(CvContent.safeParse(cv).success).toBe(true)

    const tooLong = sampleCv()
    tooLong.experiences[0]!.bullets[0]!.text = 'x'.repeat(CV_LIMITS.bullet + 1)
    expect(CvContent.safeParse(tooLong).success).toBe(false)

    const tooMany = sampleCv()
    tooMany.languages = Array.from({ length: CV_LIMITS.languages + 1 }, () =>
      createCvItem('languages', { name: 'Langue' }),
    )
    expect(CvContent.safeParse(tooMany).success).toBe(false)
  })

  it('rejects ids that Claude could not quote reliably', () => {
    const cv = sampleCv()
    cv.experiences[0]!.id = 'Not An Id!'
    expect(CvContent.safeParse(cv).success).toBe(false)
  })

  it('creates items with fresh ids, known fields only, cut to their limits', () => {
    const item = createCvItem('experiences', {
      title: 'x'.repeat(500),
      organization: 'Agence',
      unknown: 'ignored',
      bullets: ['Une réalisation', '', { text: 'Une autre' }],
    })
    expect(item.id).toMatch(/^[a-z0-9]{8}$/)
    expect(item.title).toHaveLength(CV_LIMITS.shortText)
    expect(item.location).toBe('')
    expect(item.bullets.map((b) => b.text)).toEqual(['Une réalisation', 'Une autre'])
    expect('unknown' in item).toBe(false)
    const skills = createCvItem('skills', { items: ['a', '', { name: 'b', level: 9 }] }).items
    expect(skills.map(({ name, level }) => ({ name, level }))).toEqual([
      { name: 'a', level: 0 },
      { name: 'b', level: 5 },
    ])
    expect(createCvItem('languages', { name: 'Anglais', level: 'Courant (C1)' }).cefr).toBe('C1')
  })

  it('generates distinct ids', () => {
    const ids = new Set(Array.from({ length: 500 }, newCvId))
    expect(ids.size).toBe(500)
  })
})

describe('draftToContent', () => {
  const draft: CvDraftOutput = {
    header: {
      fullName: '  Camille Durand ',
      title: 'Chargée de communication',
      email: 'camille@example.com',
      phone: '',
      city: 'Lyon',
      links: [
        { label: 'LinkedIn', url: 'https://linkedin.com/in/camille' },
        { label: 'Vide', url: ' ' },
      ],
    },
    summary: '',
    experiences: [
      {
        title: 'Chargée de communication',
        organization: 'Agence',
        location: '',
        start: '03/2021',
        end: "Aujourd'hui",
        bullets: ['Réseaux sociaux', 'x'.repeat(1000)],
      },
    ],
    education: [],
    skills: [{ name: 'Outils', items: ['Canva'] }],
    languages: [],
    projects: [],
    certifications: [],
    interests: [],
  }

  it('adds ids, trims, cuts to the limits and shows only filled sections', () => {
    const cv = draftToContent(draft)
    expect(CvContent.safeParse(cv).success).toBe(true)
    expect(cv.header.fullName).toBe('Camille Durand')
    expect(cv.header.links).toHaveLength(1)
    expect(cv.experiences[0]!.id).toMatch(/^[a-z0-9]+$/)
    expect(cv.experiences[0]!.bullets[1]!.text).toHaveLength(CV_LIMITS.bullet)
    const visible = cv.sections.filter((s) => s.visible).map((s) => s.key)
    expect(visible).toEqual(['experiences', 'skills'])
  })

  it('caps the number of items', () => {
    const many = {
      ...draft,
      languages: Array.from({ length: 30 }, (_, i) => ({ name: `L${i}`, level: '' })),
    }
    expect(draftToContent(many).languages).toHaveLength(CV_LIMITS.languages)
  })
})

describe('text exports', () => {
  it('formats date ranges per language', () => {
    expect(formatCvDateRange('03/2021', "aujourd'hui", 'fr')).toBe("03/2021 – Aujourd'hui")
    expect(formatCvDateRange('03/2021', 'Aujourd’hui', 'en')).toBe('03/2021 – Present')
    expect(formatCvDateRange('2019', '2019', 'fr')).toBe('2019')
    expect(formatCvDateRange('', '2020', 'fr')).toBe('2020')
    expect(formatCvDateRange('', '', 'fr')).toBe('')
  })

  it('renders visible, non-empty sections in order as plain text', () => {
    const cv = sampleCv()
    cv.sections.find((s) => s.key === 'languages')!.visible = false
    cv.sections.find((s) => s.key === 'skills')!.title = 'Savoir-faire'
    const text = cvToText(cv, design)
    expect(text.startsWith('Camille Durand\nChargée de communication\n')).toBe(true)
    expect(text).toContain('camille@example.com · 06 12 34 56 78 · Lyon · LinkedIn : https://')
    expect(text).toContain('EXPÉRIENCE PROFESSIONNELLE\nChargée de communication — Agence Lumière')
    expect(text).toContain(
      "03/2021 – Aujourd'hui · Lyon\n- Gestion des réseaux sociaux de 12 clients",
    )
    expect(text).toContain('SAVOIR-FAIRE\nOutils : Canva, WordPress')
    expect(text).not.toContain('LANGUES')
    expect(text).not.toContain('PROJETS') // empty
    expect(text.indexOf('PROFIL')).toBeLessThan(text.indexOf('EXPÉRIENCE'))
  })

  it('uses English titles when the document is in English', () => {
    expect(cvToText(sampleCv(), { language: 'en' })).toContain('PROFESSIONAL EXPERIENCE')
  })

  it('renders Markdown with headings and bullets', () => {
    const md = cvToMarkdown(sampleCv(), design)
    expect(md.startsWith('# Camille Durand\n\n**Chargée de communication**')).toBe(true)
    expect(md).toContain('## Expérience professionnelle')
    expect(md).toContain('### Chargée de communication — Agence Lumière')
    expect(md).toContain("*03/2021 – Aujourd'hui · Lyon*")
    expect(md).toContain('- Rédaction de communiqués de presse')
  })
})

describe('checkCv', () => {
  const ids = (cv: CvContent, options = {}) =>
    checkCv(cv, design, 'sobre', options).map((check) => check.id)

  it('has nothing serious to say about a complete CV', () => {
    const checks = checkCv(sampleCv(), design, 'sobre', { pageCount: 1 })
    expect(checks.filter((c) => c.level !== 'info')).toEqual([])
  })

  it('reports missing contact details', () => {
    const cv = sampleCv()
    cv.header.email = ''
    cv.header.phone = ''
    cv.header.fullName = ''
    expect(ids(cv)).toEqual(
      expect.arrayContaining(['missing-email', 'missing-phone', 'missing-name']),
    )
    cv.header.email = 'pas-un-email'
    expect(ids(cv)).toContain('invalid-email')
  })

  it('reports empty visible sections in one notice, not hidden ones', () => {
    const cv = sampleCv()
    const message = () =>
      checkCv(cv, design, 'sobre').find((c) => c.id === 'empty-sections')?.message
    expect(message()).toContain('« Projets », « Certifications »')
    cv.sections.find((s) => s.key === 'projects')!.visible = false
    cv.sections.find((s) => s.key === 'certifications')!.visible = false
    expect(message()).toBe(
      "La section « Centres d'intérêt » est vide : remplis-la ou masque-la (elle n’apparaît pas sur le PDF).",
    )
    cv.sections.find((s) => s.key === 'interests')!.visible = false
    expect(message()).toBeUndefined()
  })

  it('checks date formats, order and the chronology of experiences', () => {
    const cv = sampleCv()
    cv.experiences[1]!.start = 'sept 2018'
    cv.education[0]!.start = '2019'
    cv.education[0]!.end = '2017'
    const found = ids(cv)
    expect(found).toContain('date-format:e2:start')
    expect(found).toContain('date-order:d1')
    expect(found).not.toContain('date-format:e1:end') // « Aujourd'hui » is fine

    const reversed = sampleCv()
    reversed.experiences.reverse()
    expect(ids(reversed)).toContain('experience-order')
  })

  it('flags long and short bullets, missing bullets and long summaries', () => {
    const cv = sampleCv()
    cv.experiences[0]!.bullets[0]!.text = 'x'.repeat(250)
    cv.experiences[0]!.bullets[1]!.text = 'Trop court'
    cv.experiences[1]!.bullets = []
    cv.summary = 'y'.repeat(700)
    expect(ids(cv)).toEqual(
      expect.arrayContaining([
        'long-bullet:b1',
        'short-bullet:b2',
        'no-bullets:e2',
        'long-summary',
      ]),
    )
  })

  it('reminds the user of placeholders and unprintable characters', () => {
    const cv = sampleCv()
    cv.experiences[0]!.bullets[0]!.text = 'Hausse de [X %] de l’engagement ✅'
    const checks = checkCv(cv, design, 'sobre')
    expect(checks.find((c) => c.id === 'placeholders')?.message).toContain('un passage')
    expect(checks.find((c) => c.id === 'unprintable')?.message).toContain('✅')
  })

  it('uses the real page count when known, and mentions the template ATS note', () => {
    expect(ids(sampleCv(), { pageCount: 3 })).toContain('pages')
    expect(ids(sampleCv(), { pageCount: 1 })).not.toContain('pages')
    expect(checkCv(sampleCv(), design, 'moderne').map((c) => c.id)).toContain('template-ats')
  })

  it('sorts errors first', () => {
    const cv = sampleCv()
    cv.header.email = ''
    const levels = checkCv(cv, design, 'moderne').map((c) => c.level)
    expect(levels[0]).toBe('error')
    expect(levels).toEqual(
      [...levels].sort(
        (a, b) => ['error', 'warning', 'info'].indexOf(a) - ['error', 'warning', 'info'].indexOf(b),
      ),
    )
  })

  it('estimates more pages for longer CVs and denser layouts hold more', () => {
    const cv = sampleCv()
    expect(estimateCvPages(cv, 'normal')).toBe(1)
    for (let i = 0; i < 12; i++) {
      cv.experiences.push(
        createCvItem('experiences', { title: 'Poste', bullets: Array(6).fill('z'.repeat(180)) }),
      )
    }
    expect(estimateCvPages(cv, 'normal')).toBeGreaterThan(1)
    expect(estimateCvPages(cv, 'compact')).toBeLessThanOrEqual(estimateCvPages(cv, 'comfortable'))
  })
})

describe('printable characters', () => {
  it('keeps French text intact and strips what the fonts cannot print', () => {
    const french = 'Œuvre « été » à Noël — l’équipe… 30 € ça marche ! ÀÉÈÙÇ'
    expect(unprintableCharacters(french)).toEqual([])
    expect(stripUnprintable(french)).toBe(french)
    expect(unprintableCharacters('ok ✓ 🚀 ✓')).toEqual(['✓', '🚀'])
    expect(stripUnprintable('Lancement 🚀 réussi')).toBe('Lancement  réussi')
  })
})
