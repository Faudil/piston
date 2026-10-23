import { describe, expect, it } from 'vitest'
import {
  CV_LIMITS,
  CvContent,
  CvDesign,
  applyCvOperation,
  checkCv,
  createCvCustomSection,
  cvSectionKeys,
  cvSectionTitle,
  cvTemplateIds,
  cvTemplates,
  cvToMarkdown,
  cvToText,
  describeCvOperation,
  normalizeSections,
  parseCvEditOutput,
  renderedCvSections,
  resetCvDesign,
  resolveCvDesign,
  stripUnprintable,
  unprintableCharacters,
  upgradeCvContent,
  upgradeCvDesign,
  upgradeCvDocument,
  upgradedSkillId,
  type CvApplyResult,
  type CvOperation,
} from '../src'
import { sampleCv } from './cv-fixture'
import { v1Content, v1CustomDesign, v1DefaultDesign } from './v1-fixtures'

const reason = 'Parce que.'

function applied(result: CvApplyResult): CvContent {
  if (!result.ok) throw new Error(`expected success, got: ${result.reason}`)
  expect(CvContent.safeParse(result.content).success).toBe(true)
  return result.content
}

function failure(result: CvApplyResult): string {
  if (result.ok) throw new Error('expected a failure')
  return result.reason
}

/** A document with one custom section (« Expositions », two items). */
function withCustom(): CvContent {
  const cv = sampleCv()
  cv.custom.push({
    id: 'c1',
    title: 'Expositions',
    items: [
      { id: 'ci1', title: 'Regards', subtitle: 'Galerie Nord', date: '2023', text: '' },
      { id: 'ci2', title: 'Lumières', subtitle: '', date: '2022', text: 'Collective' },
    ],
  })
  return CvContent.parse(cv)
}

describe('upgradeCvDocument (v1 → v2)', () => {
  it('upgrades a stored v1 document without losing anything', () => {
    const { content, design } = upgradeCvDocument({
      content: v1Content,
      design: v1DefaultDesign,
    })
    expect(content.version).toBe(2)
    expect(content.header.fullName).toBe('Élodie Lefèvre')
    expect(content.header.photo).toBeNull()
    expect(content.experiences).toEqual(v1Content.experiences)
    // Skills become objects with deterministic ids and no level.
    expect(content.skills[0]!.items).toEqual([
      { id: upgradedSkillId('s1', 0), name: 'Canva', level: 0 },
      { id: upgradedSkillId('s1', 1), name: 'Suite Adobe', level: 0 },
      { id: upgradedSkillId('s1', 2), name: 'WordPress', level: 0 },
    ])
    expect(content.skills[1]!.items).toEqual([])
    // CEFR levels inferred from the free text, which is kept.
    expect(content.languages.map(({ level, cefr }) => [level, cefr])).toEqual([
      ['C1', 'C1'],
      ['Courant', null],
      ['Langue maternelle', 'natif'],
    ])
    // The user's order, titles and visibility are kept; new sections are appended hidden.
    expect(content.sections.slice(0, 8)).toEqual(
      v1Content.sections.map((section) => ({ ...section, column: 'auto' })),
    )
    expect(content.sections.slice(8).map((s) => [s.key, s.visible])).toEqual([
      ['volunteering', false],
      ['awards', false],
      ['publications', false],
      ['references', false],
      ['extras', false],
    ])
    expect(content.custom).toEqual([])
    expect(content.referencesAvailableOnRequest).toBe(false)
    expect(design).toMatchObject({ version: 2, language: 'fr', pageFormat: 'A4' })
  })

  it('is idempotent and deterministic', () => {
    const once = upgradeCvDocument({ content: v1Content, design: v1CustomDesign })
    const twice = upgradeCvDocument(once)
    expect(twice).toEqual(once)
    // Two independent reads of the same v1 document agree (same skill ids).
    expect(upgradeCvDocument({ content: v1Content, design: v1CustomDesign })).toEqual(once)
    expect(upgradeCvContent(once.content)).toBe(once.content)
  })

  it('renders the same text before and after the upgrade', () => {
    const { content, design } = upgradeCvDocument({
      content: v1Content,
      design: v1DefaultDesign,
    })
    const text = cvToText(content, design)
    expect(text).toContain('SAVOIR-FAIRE\nOutils : Canva, Suite Adobe, WordPress')
    expect(text).toContain('Anglais : C1\nEspagnol : Courant')
    expect(text).not.toContain('BÉNÉVOLAT')
  })

  it('leaves values it cannot upgrade to the schema, which rejects them', () => {
    expect(upgradeCvContent('nope')).toBe('nope')
    expect(CvContent.safeParse({ ...v1Content, version: 3 }).success).toBe(false)
    expect(CvDesign.safeParse({ ...v1DefaultDesign, accentColor: 'red' }).success).toBe(false)
  })

  it('upgrades v1 designs into overrides that keep the look', () => {
    expect(CvDesign.parse(v1DefaultDesign)).toEqual({
      version: 2,
      language: 'fr',
      pageFormat: 'A4',
      palette: { primary: '#c8410b' },
      fontPairing: 'inter',
    })
    expect(CvDesign.parse(v1CustomDesign)).toEqual({
      version: 2,
      language: 'en',
      pageFormat: 'A4',
      palette: { primary: '#1d4ed8' },
      fontPairing: 'source-serif',
      spacing: 'compact',
      fontSize: -1,
    })
    expect(CvDesign.parse({ density: 'comfortable' })).toMatchObject({
      spacing: 'comfortable',
      fontSize: 1,
    })
    expect(CvDesign.parse({})).toEqual({
      version: 2,
      language: 'fr',
      pageFormat: 'A4',
      palette: {},
    })
  })

  it('treats null design fields as "no override"', () => {
    const design = CvDesign.parse({ version: 2, fontPairing: null, palette: { primary: null } })
    expect(design.fontPairing).toBeUndefined()
    expect(design.palette).toEqual({})
    expect(upgradeCvDesign(upgradeCvDesign(v1CustomDesign))).toEqual(
      upgradeCvDesign(v1CustomDesign),
    )
  })
})

describe('content v2', () => {
  it('normalizes custom section entries: one per custom section, titles in `custom`', () => {
    const sections = normalizeSections(
      [
        { key: 'custom', customId: 'c1', title: 'ignored', visible: false, column: 'side' },
        { key: 'custom', customId: 'c1', title: '', visible: true, column: 'auto' },
        { key: 'custom', customId: 'gone', title: '', visible: true, column: 'auto' },
      ],
      ['c1', 'c2'],
    )
    expect(sections[0]).toEqual({
      key: 'custom',
      customId: 'c1',
      title: '',
      visible: false,
      column: 'side',
    })
    expect(sections).toHaveLength(cvSectionKeys.length + 2)
    expect(sections.at(-1)).toMatchObject({ key: 'custom', customId: 'c2', visible: true })
    expect(sections.some((s) => s.key === 'custom' && s.customId === 'gone')).toBe(false)
  })

  it('bounds the new lists and strings', () => {
    const cv = withCustom()
    cv.extras = Array.from({ length: CV_LIMITS.extras + 1 }, (_, i) => ({
      id: `x${i}`,
      text: 'Permis B',
    }))
    expect(CvContent.safeParse(cv).success).toBe(false)

    const long = withCustom()
    long.custom[0]!.items[0]!.text = 'x'.repeat(CV_LIMITS.customText + 1)
    expect(CvContent.safeParse(long).success).toBe(false)

    const level = sampleCv()
    level.skills[0]!.items[0]!.level = 6
    expect(CvContent.safeParse(level).success).toBe(false)

    const photo = sampleCv()
    photo.header.photo = {
      assetId: 'not-a-uuid',
      shape: 'round',
      size: 'm',
      position: 'left',
      visible: true,
    }
    expect(CvContent.safeParse(photo).success).toBe(false)
  })

  it('exports the new sections and custom sections as text', () => {
    const cv = withCustom()
    cv.volunteering.push({
      id: 'v1',
      title: 'Bénévole',
      organization: 'Restos du Cœur',
      location: 'Lyon',
      start: '2019',
      end: '2020',
      bullets: [{ id: 'vb1', text: 'Distribution hebdomadaire' }],
    })
    cv.extras.push({ id: 'x1', text: 'Permis B' })
    cv.references.push({
      id: 'r1',
      name: 'Jean Martin',
      role: 'Directeur',
      organization: 'Agence Lumière',
      contact: 'jean@example.com',
    })
    for (const key of ['volunteering', 'extras', 'references'] as const) {
      cv.sections.find((s) => s.key === key)!.visible = true
    }
    const text = cvToText(cv, { language: 'fr' })
    expect(text).toContain(
      'BÉNÉVOLAT\nBénévole — Restos du Cœur\n2019 – 2020 · Lyon\n- Distribution',
    )
    expect(text).toContain('INFORMATIONS COMPLÉMENTAIRES\nPermis B')
    expect(text).toContain('Jean Martin — Directeur, Agence Lumière · jean@example.com')
    expect(text).toContain('EXPOSITIONS\nRegards — Galerie Nord\n2023')

    cv.referencesAvailableOnRequest = true
    expect(cvToText(cv, { language: 'en' })).toContain(
      'REFERENCES\nReferences available upon request',
    )
    expect(cvToMarkdown(cv, { language: 'fr' })).toContain('## Expositions')
  })

  it('shows « Disponibles sur demande » even without references', () => {
    const cv = sampleCv()
    cv.sections.find((s) => s.key === 'references')!.visible = true
    expect(renderedCvSections(cv).some((s) => s.key === 'references')).toBe(false)
    cv.referencesAvailableOnRequest = true
    expect(renderedCvSections(cv).some((s) => s.key === 'references')).toBe(true)
  })

  it('titles custom sections from `custom`', () => {
    const cv = withCustom()
    const entry = cv.sections.find((s) => s.key === 'custom')!
    expect(cvSectionTitle(entry, 'fr', cv.custom)).toBe('Expositions')
    expect(cvSectionTitle(entry, 'fr')).toBe('Section personnalisée')
  })

  it('prints Latin Extended letters and NFC-normalizes decomposed accents', () => {
    expect(unprintableCharacters('Zażółć gęślą jaźń · Şişli · Dvořák · Ő')).toEqual([])
    expect(unprintableCharacters('Привет 🚀')).toEqual(['П', 'р', 'и', 'в', 'е', 'т', '🚀'])
    const decomposed = 'Eléonore'
    expect(stripUnprintable(decomposed)).toBe('Éléonore'.replace('É', 'E'))
    expect(stripUnprintable(decomposed)).toHaveLength(8)
  })
})

describe('design v2', () => {
  it('resolves a template’s tokens, the overrides applied', () => {
    const resolved = resolveCvDesign(cvTemplates.moderne, CvDesign.parse({}))
    expect(resolved).toMatchObject({
      templateId: 'moderne',
      layout: 'sidebar-left',
      headerStyle: 'sidebar',
      fontPairing: 'inter',
      language: 'fr',
      pageFormat: 'A4',
      palette: { primary: '#c8410b', text: '#1c1917' },
    })
    // Derived colors follow the primary color.
    expect(resolved.palette.sidebarBg).toBe('#faece7')

    const custom = resolveCvDesign(
      cvTemplates.moderne,
      CvDesign.parse({
        version: 2,
        palette: { primary: '#1d4ed8', text: '#111111' },
        layout: 'single',
        skillStyle: 'bars',
        fontSize: 2,
        pageFormat: 'Letter',
      }),
    )
    expect(custom).toMatchObject({
      layout: 'single',
      skillStyle: 'bars',
      fontSize: 2,
      pageFormat: 'Letter',
      palette: { primary: '#1d4ed8', text: '#111111', sidebarBg: '#e8edfb' },
    })
  })

  it('keeps overrides across templates, and resets to the template', () => {
    const design = CvDesign.parse({ version: 2, fontPairing: 'eb-garamond', language: 'en' })
    for (const id of cvTemplateIds) {
      expect(resolveCvDesign(cvTemplates[id], design).fontPairing).toBe('eb-garamond')
    }
    const reset = resetCvDesign(design)
    expect(reset).toEqual({ version: 2, language: 'en', pageFormat: 'A4', palette: {} })
    expect(resolveCvDesign(cvTemplates.sobre, reset).fontPairing).toBe('inter')
  })

  it('declares every template completely', () => {
    for (const id of cvTemplateIds) {
      const template = cvTemplates[id]
      expect(template.id).toBe(id)
      expect(template.label).toBeTruthy()
      expect(template.typography.baseSize).toBeGreaterThan(6)
    }
  })

  it('warns about two-column layouts and gauges without levels', () => {
    const cv = sampleCv()
    const ids = (design: object, templateId: 'sobre' | 'moderne' = 'sobre') =>
      checkCv(cv, CvDesign.parse(design), templateId, { pageCount: 1 }).map((c) => c.id)
    expect(ids({})).not.toContain('template-ats')
    expect(ids({ version: 2, layout: 'split' })).toContain('template-ats')
    expect(ids({ version: 2, skillStyle: 'dots' })).toContain('skill-levels')
    cv.skills[0]!.items[0]!.level = 3
    expect(ids({ version: 2, skillStyle: 'dots' })).not.toContain('skill-levels')
    cv.languages[0]!.cefr = null
    expect(ids({ version: 2, languageStyle: 'bars' })).toContain('language-levels')
  })

  it('mentions the photo, more firmly for an English CV', () => {
    const cv = sampleCv()
    cv.header.photo = {
      assetId: '00000000-0000-4000-8000-000000000000',
      shape: 'round',
      size: 'm',
      position: 'left',
      visible: true,
    }
    const message = (language: 'fr' | 'en') =>
      checkCv(cv, CvDesign.parse({ language }), 'sobre').find((c) => c.id === 'photo')?.message
    expect(message('fr')).toContain('courante en France')
    expect(message('en')).toContain('déconseillée')
  })
})

describe('v2 operations', () => {
  it('keeps levels of the skills that set_skills keeps', () => {
    const cv = sampleCv()
    cv.skills[0]!.items[1]!.level = 4 // WordPress
    const next = applied(
      applyCvOperation(cv, {
        op: 'set_skills',
        itemId: 's1',
        items: ['wordpress', 'Figma', ' '],
        reason,
      }),
    )
    expect(next.skills[0]!.items.map(({ name, level }) => [name, level])).toEqual([
      ['wordpress', 4],
      ['Figma', 0],
    ])
    expect(next.skills[0]!.items[0]!.id).toBe(cv.skills[0]!.items[1]!.id)
  })

  it('sets a skill level within 0–5', () => {
    const cv = sampleCv()
    const skillId = cv.skills[0]!.items[0]!.id
    const op = (level: number): CvOperation => ({
      op: 'set_skill_level',
      itemId: 's1',
      skillId,
      level,
      reason,
    })
    expect(applied(applyCvOperation(cv, op(4))).skills[0]!.items[0]!.level).toBe(4)
    expect(failure(applyCvOperation(cv, op(6)))).toContain('niveau')
    expect(failure(applyCvOperation(cv, op(2.5)))).toContain('niveau')
    expect(failure(applyCvOperation(cv, { ...op(1), skillId: 'nope' } as CvOperation))).toContain(
      'introuvable',
    )
    expect(describeCvOperation(cv, op(4))).toMatchObject({
      before: 'Sans niveau',
      after: 'Niveau 4/5',
    })
  })

  it('sets or clears a language’s CEFR level', () => {
    const op = (cefr: 'B2' | null): CvOperation => ({
      op: 'set_language_cefr',
      itemId: 'g1',
      cefr,
      reason,
    })
    expect(applied(applyCvOperation(sampleCv(), op('B2'))).languages[0]!.cefr).toBe('B2')
    expect(applied(applyCvOperation(sampleCv(), op(null))).languages[0]!.cefr).toBeNull()
    expect(describeCvOperation(sampleCv(), op('B2')).after).toBe('B2 · Avancé')
  })

  it('adds items to the new sections and bullets to volunteering', () => {
    const cv = applied(
      applyCvOperation(sampleCv(), {
        op: 'add_item',
        section: 'volunteering',
        position: null,
        item: { title: 'Bénévole', organization: 'Restos du Cœur', bullets: ['Accueil'] },
        reason,
      }),
    )
    const item = cv.volunteering[0]!
    expect(item.bullets.map((b) => b.text)).toEqual(['Accueil'])
    const withBullet = applied(
      applyCvOperation(cv, {
        op: 'add_bullet',
        section: 'volunteering',
        itemId: item.id,
        afterBulletId: null,
        text: 'Collecte nationale',
        reason,
      }),
    )
    expect(withBullet.volunteering[0]!.bullets).toHaveLength(2)

    const extras = applied(
      applyCvOperation(sampleCv(), {
        op: 'add_item',
        section: 'extras',
        position: null,
        item: { text: 'Permis B' },
        reason,
      }),
    )
    expect(extras.extras[0]!.text).toBe('Permis B')
    expect(
      failure(
        applyCvOperation(sampleCv(), {
          op: 'add_item',
          section: 'extras',
          position: null,
          item: { text: 'x'.repeat(CV_LIMITS.extraLine + 1) },
          reason,
        }),
      ),
    ).toContain('trop long')
  })

  it('moves a section between columns and renames a custom section', () => {
    const cv = withCustom()
    const column = applied(
      applyCvOperation(cv, {
        op: 'set_section',
        section: 'skills',
        visible: null,
        title: null,
        column: 'main',
        reason,
      }),
    )
    expect(column.sections.find((s) => s.key === 'skills')!.column).toBe('main')

    const renamed = applied(
      applyCvOperation(cv, {
        op: 'set_section',
        section: 'custom',
        customId: 'c1',
        visible: false,
        title: 'Expositions récentes',
        reason,
      }),
    )
    expect(renamed.custom[0]!.title).toBe('Expositions récentes')
    expect(renamed.sections.find((s) => s.key === 'custom')).toMatchObject({
      visible: false,
      title: '',
    })
    expect(
      failure(
        applyCvOperation(cv, {
          op: 'set_section',
          section: 'custom',
          customId: 'zz',
          visible: true,
          title: null,
          reason,
        }),
      ),
    ).toContain('introuvable')
    const moved = applied(
      applyCvOperation(cv, {
        op: 'move_section',
        section: 'custom',
        customId: 'c1',
        toIndex: 0,
        reason,
      }),
    )
    expect(moved.sections[0]).toMatchObject({ key: 'custom', customId: 'c1' })
  })

  it('adds and removes custom sections', () => {
    const cv = applied(
      applyCvOperation(sampleCv(), {
        op: 'add_custom_section',
        title: 'Associations',
        position: 1,
        items: [{ title: 'BDE' }, {}],
        reason,
      }),
    )
    expect(cv.custom).toHaveLength(1)
    expect(cv.custom[0]!.items.map((item) => item.title)).toEqual(['BDE'])
    expect(cv.sections[1]).toMatchObject({ key: 'custom', customId: cv.custom[0]!.id })
    expect(cv.sections.filter((s) => s.key === 'custom')).toHaveLength(1)

    const removed = applied(
      applyCvOperation(cv, { op: 'remove_custom_section', customId: cv.custom[0]!.id, reason }),
    )
    expect(removed.custom).toEqual([])
    expect(removed.sections.some((s) => s.key === 'custom')).toBe(false)

    const full = sampleCv()
    full.custom = Array.from({ length: CV_LIMITS.customSections }, (_, i) => ({
      ...createCvCustomSection(`S${i}`),
      id: `c${i}`,
    }))
    expect(
      failure(
        applyCvOperation(CvContent.parse(full), {
          op: 'add_custom_section',
          title: 'Une de trop',
          position: null,
          items: [],
          reason,
        }),
      ),
    ).toContain('au maximum')
    expect(
      failure(
        applyCvOperation(sampleCv(), {
          op: 'add_custom_section',
          title: ' ',
          position: null,
          items: [],
          reason,
        }),
      ),
    ).toContain('vide')
  })

  it('edits, adds, moves and removes custom items', () => {
    const cv = withCustom()
    const edited = applied(
      applyCvOperation(cv, {
        op: 'set_custom_item',
        customId: 'c1',
        itemId: 'ci1',
        field: 'text',
        value: 'Photographies urbaines',
        reason,
      }),
    )
    expect(edited.custom[0]!.items[0]!.text).toBe('Photographies urbaines')

    const added = applied(
      applyCvOperation(cv, {
        op: 'add_custom_item',
        customId: 'c1',
        position: 0,
        item: { title: 'Nouvelle', date: '2024' },
        reason,
      }),
    )
    expect(added.custom[0]!.items.map((item) => item.title)).toEqual([
      'Nouvelle',
      'Regards',
      'Lumières',
    ])
    expect(
      failure(
        applyCvOperation(cv, {
          op: 'add_custom_item',
          customId: 'c1',
          position: null,
          item: {},
          reason,
        }),
      ),
    ).toContain('vide')

    const moved = applied(
      applyCvOperation(cv, {
        op: 'move_custom_item',
        customId: 'c1',
        itemId: 'ci2',
        toIndex: 0,
        reason,
      }),
    )
    expect(moved.custom[0]!.items[0]!.id).toBe('ci2')

    const removed = applied(
      applyCvOperation(cv, { op: 'remove_custom_item', customId: 'c1', itemId: 'ci1', reason }),
    )
    expect(removed.custom[0]!.items.map((item) => item.id)).toEqual(['ci2'])
    expect(
      describeCvOperation(cv, {
        op: 'remove_custom_item',
        customId: 'c1',
        itemId: 'ci1',
        reason,
      }),
    ).toMatchObject({
      kind: 'remove',
      target: 'Section « Expositions » · Regards',
      before: 'Regards · Galerie Nord · 2023',
    })
  })

  it('converts the v2 wire fields', () => {
    const base = {
      section: null,
      customId: null,
      itemId: null,
      bulletId: null,
      field: null,
      value: null,
      list: null,
      fields: null,
      index: null,
      level: null,
      visible: null,
      column: null,
      reason,
    }
    const proposal = parseCvEditOutput({
      summary: 'v2',
      operations: [
        { ...base, op: 'set_skill_level', itemId: 's1', bulletId: 'k1', level: 3 },
        { ...base, op: 'set_language_cefr', itemId: 'g1', value: 'natif' },
        { ...base, op: 'set_section', section: 'skills', column: 'side' },
        { ...base, op: 'add_custom_section', value: 'Expositions', list: ['Regards'], index: null },
        {
          ...base,
          op: 'add_custom_item',
          customId: 'c1',
          fields: [{ name: 'title', value: 'Lumières' }],
        },
        {
          ...base,
          op: 'set_custom_item',
          customId: 'c1',
          itemId: 'ci1',
          field: 'date',
          value: '2021',
        },
        { ...base, op: 'remove_custom_section', customId: 'c1' },
        // Invalid: a level out of the wire, a column that does not exist, an unknown custom field.
        { ...base, op: 'set_skill_level', itemId: 's1', bulletId: 'k1' },
        { ...base, op: 'set_section', section: 'skills', column: 'left' },
        { ...base, op: 'set_custom_item', customId: 'c1', itemId: 'ci1', field: 'url', value: 'x' },
      ],
    })
    expect(proposal!.dropped).toBe(3)
    expect(proposal!.operations).toEqual([
      { op: 'set_skill_level', itemId: 's1', skillId: 'k1', level: 3, reason },
      { op: 'set_language_cefr', itemId: 'g1', cefr: 'natif', reason },
      {
        op: 'set_section',
        section: 'skills',
        customId: null,
        visible: null,
        title: null,
        column: 'side',
        reason,
      },
      {
        op: 'add_custom_section',
        title: 'Expositions',
        position: null,
        items: [{ title: 'Regards' }],
        reason,
      },
      {
        op: 'add_custom_item',
        customId: 'c1',
        position: null,
        item: { title: 'Lumières' },
        reason,
      },
      {
        op: 'set_custom_item',
        customId: 'c1',
        itemId: 'ci1',
        field: 'date',
        value: '2021',
        reason,
      },
      { op: 'remove_custom_section', customId: 'c1', reason },
    ])
  })

  it('still parses wire operations written without the v2 fields', () => {
    const proposal = parseCvEditOutput({
      summary: 'v1',
      operations: [
        {
          op: 'move_section',
          section: 'skills',
          itemId: null,
          bulletId: null,
          field: null,
          value: null,
          list: null,
          fields: null,
          index: 0,
          visible: null,
          reason,
        },
      ],
    })
    expect(proposal!.operations).toEqual([
      { op: 'move_section', section: 'skills', customId: null, toIndex: 0, reason },
    ])
  })
})
