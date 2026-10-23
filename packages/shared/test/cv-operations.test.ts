import { describe, expect, it } from 'vitest'
import {
  CV_LIMITS,
  CvContent,
  applyCvOperation,
  applyCvOperations,
  describeCvOperation,
  diffWords,
  parseCvEditOutput,
  type CvApplyResult,
  type CvOperation,
  type CvOperationWire,
} from '../src'
import { sampleCv } from './cv-fixture'

const reason = 'Parce que.'

function applied(result: CvApplyResult): CvContent {
  if (!result.ok) throw new Error(`expected success, got: ${result.reason}`)
  // Every successful result is still a valid document.
  expect(CvContent.safeParse(result.content).success).toBe(true)
  return result.content
}

function failure(result: CvApplyResult): string {
  if (result.ok) throw new Error('expected a failure')
  return result.reason
}

describe('applyCvOperation', () => {
  it('accepts a proxied document, as the editor passes reactive state', () => {
    const proxied = new Proxy(sampleCv(), {})
    const cv = applied(applyCvOperation(proxied, { op: 'set_summary', value: 'Nouveau', reason }))
    expect(cv.summary).toBe('Nouveau')
  })

  it('never mutates its input', () => {
    const cv = sampleCv()
    const before = JSON.stringify(cv)
    applyCvOperation(cv, { op: 'set_summary', value: 'Nouveau', reason })
    applyCvOperation(cv, { op: 'remove_item', section: 'experiences', itemId: 'e1', reason })
    applyCvOperation(cv, { op: 'move_section', section: 'skills', toIndex: 0, reason })
    expect(JSON.stringify(cv)).toBe(before)
  })

  describe('header and summary', () => {
    it('sets a header field', () => {
      const cv = applied(
        applyCvOperation(sampleCv(), {
          op: 'set_header',
          field: 'title',
          value: 'Responsable communication',
          reason,
        }),
      )
      expect(cv.header.title).toBe('Responsable communication')
    })

    it('refuses values over the field limit', () => {
      const op: CvOperation = {
        op: 'set_header',
        field: 'phone',
        value: '0'.repeat(CV_LIMITS.phone + 1),
        reason,
      }
      expect(failure(applyCvOperation(sampleCv(), op))).toContain('trop long')
    })

    it('sets the summary within its limit', () => {
      expect(
        applied(applyCvOperation(sampleCv(), { op: 'set_summary', value: 'Accroche', reason }))
          .summary,
      ).toBe('Accroche')
      expect(
        failure(
          applyCvOperation(sampleCv(), {
            op: 'set_summary',
            value: 'x'.repeat(CV_LIMITS.summary + 1),
            reason,
          }),
        ),
      ).toContain('trop long')
    })
  })

  describe('set_field', () => {
    it('sets a text field of an item', () => {
      const cv = applied(
        applyCvOperation(sampleCv(), {
          op: 'set_field',
          section: 'languages',
          itemId: 'g1',
          field: 'level',
          value: 'Courant (C1)',
          reason,
        }),
      )
      expect(cv.languages[0]!.level).toBe('Courant (C1)')
    })

    it('refuses fields the item type does not have, ids and lists', () => {
      for (const field of ['level', 'id', 'bullets', '__proto__']) {
        expect(
          failure(
            applyCvOperation(sampleCv(), {
              op: 'set_field',
              section: 'experiences',
              itemId: 'e1',
              field,
              value: 'x',
              reason,
            }),
          ),
        ).toContain('n’existe pas')
      }
    })

    it('refuses unknown items and uses per-field limits', () => {
      expect(
        failure(
          applyCvOperation(sampleCv(), {
            op: 'set_field',
            section: 'experiences',
            itemId: 'nope',
            field: 'title',
            value: 'x',
            reason,
          }),
        ),
      ).toContain('introuvable')
      expect(
        failure(
          applyCvOperation(sampleCv(), {
            op: 'set_field',
            section: 'experiences',
            itemId: 'e1',
            field: 'start',
            value: 'x'.repeat(CV_LIMITS.date + 1),
            reason,
          }),
        ),
      ).toContain('trop long')
    })
  })

  describe('skills', () => {
    it('replaces a group’s items, dropping blanks', () => {
      const cv = applied(
        applyCvOperation(sampleCv(), {
          op: 'set_skills',
          itemId: 's1',
          items: ['Canva', ' ', 'Figma'],
          reason,
        }),
      )
      expect(cv.skills[0]!.items).toEqual(['Canva', 'Figma'])
    })

    it('refuses too many or too long items and unknown groups', () => {
      expect(
        failure(
          applyCvOperation(sampleCv(), {
            op: 'set_skills',
            itemId: 's1',
            items: Array(CV_LIMITS.skillItems + 1).fill('a'),
            reason,
          }),
        ),
      ).toContain('Trop')
      expect(
        failure(
          applyCvOperation(sampleCv(), {
            op: 'set_skills',
            itemId: 's1',
            items: ['x'.repeat(CV_LIMITS.skillItem + 1)],
            reason,
          }),
        ),
      ).toContain('trop long')
      expect(
        failure(
          applyCvOperation(sampleCv(), { op: 'set_skills', itemId: 'nope', items: [], reason }),
        ),
      ).toContain('introuvable')
    })
  })

  describe('bullets', () => {
    it('replaces a bullet', () => {
      const cv = applied(
        applyCvOperation(sampleCv(), {
          op: 'set_bullet',
          section: 'experiences',
          itemId: 'e1',
          bulletId: 'b2',
          text: 'Rédaction de 30 communiqués',
          reason,
        }),
      )
      expect(cv.experiences[0]!.bullets.map((b) => b.text)).toEqual([
        'Gestion des réseaux sociaux de 12 clients',
        'Rédaction de 30 communiqués',
      ])
    })

    it('refuses an empty text, an unknown bullet, or a bullet of another item', () => {
      expect(
        failure(
          applyCvOperation(sampleCv(), {
            op: 'set_bullet',
            section: 'experiences',
            itemId: 'e1',
            bulletId: 'b1',
            text: '  ',
            reason,
          }),
        ),
      ).toContain('vide')
      expect(
        failure(
          applyCvOperation(sampleCv(), {
            op: 'set_bullet',
            section: 'experiences',
            itemId: 'e1',
            bulletId: 'b3',
            text: 'x',
            reason,
          }),
        ),
      ).toContain('introuvable')
      expect(
        failure(
          applyCvOperation(sampleCv(), {
            op: 'set_bullet',
            section: 'projects',
            itemId: 'e1',
            bulletId: 'b1',
            text: 'x',
            reason,
          }),
        ),
      ).toContain('introuvable')
    })

    it('adds a bullet after another one, at the end, or at the end when the reference is unknown', () => {
      const after = applied(
        applyCvOperation(sampleCv(), {
          op: 'add_bullet',
          section: 'experiences',
          itemId: 'e1',
          afterBulletId: 'b1',
          text: 'Nouvelle',
          reason,
        }),
      )
      expect(after.experiences[0]!.bullets.map((b) => b.text)).toEqual([
        'Gestion des réseaux sociaux de 12 clients',
        'Nouvelle',
        'Rédaction de communiqués de presse',
      ])
      const end = applied(
        applyCvOperation(sampleCv(), {
          op: 'add_bullet',
          section: 'experiences',
          itemId: 'e1',
          afterBulletId: null,
          text: 'Fin',
          reason,
        }),
      )
      expect(end.experiences[0]!.bullets.at(-1)!.text).toBe('Fin')
      const unknown = applied(
        applyCvOperation(sampleCv(), {
          op: 'add_bullet',
          section: 'experiences',
          itemId: 'e1',
          afterBulletId: 'zz',
          text: 'Fin',
          reason,
        }),
      )
      expect(unknown.experiences[0]!.bullets.at(-1)!.text).toBe('Fin')
    })

    it('gives new bullets unique ids', () => {
      const cv = applied(
        applyCvOperation(sampleCv(), {
          op: 'add_bullet',
          section: 'experiences',
          itemId: 'e1',
          afterBulletId: null,
          text: 'Nouvelle',
          reason,
        }),
      )
      const ids = cv.experiences[0]!.bullets.map((b) => b.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('refuses to exceed the bullet limit', () => {
      const cv = sampleCv()
      cv.experiences[0]!.bullets = Array.from({ length: CV_LIMITS.bullets }, (_, i) => ({
        id: `x${i}`,
        text: 'Puce',
      }))
      expect(
        failure(
          applyCvOperation(cv, {
            op: 'add_bullet',
            section: 'experiences',
            itemId: 'e1',
            afterBulletId: null,
            text: 'Une de trop',
            reason,
          }),
        ),
      ).toContain('maximum')
    })

    it('removes a bullet, once', () => {
      const op: CvOperation = {
        op: 'remove_bullet',
        section: 'experiences',
        itemId: 'e1',
        bulletId: 'b1',
        reason,
      }
      const cv = applied(applyCvOperation(sampleCv(), op))
      expect(cv.experiences[0]!.bullets.map((b) => b.id)).toEqual(['b2'])
      expect(failure(applyCvOperation(cv, op))).toContain('introuvable')
    })
  })

  describe('items', () => {
    it('adds an item at a position, keeping only the section’s fields', () => {
      const cv = applied(
        applyCvOperation(sampleCv(), {
          op: 'add_item',
          section: 'experiences',
          position: 1,
          item: {
            title: 'Stagiaire communication',
            organization: 'X',
            start: '2023',
            degree: 'ignored',
            bullets: ['Veille'],
          },
          reason,
        }),
      )
      expect(cv.experiences.map((e) => e.title)).toEqual([
        'Chargée de communication',
        'Stagiaire communication',
        'Assistante communication',
      ])
      const added = cv.experiences[1]!
      expect(added.bullets.map((b) => b.text)).toEqual(['Veille'])
      expect('degree' in added).toBe(false)
    })

    it('adds at the end with a null position and clamps out-of-range positions', () => {
      const end = applied(
        applyCvOperation(sampleCv(), {
          op: 'add_item',
          section: 'languages',
          position: null,
          item: { name: 'Espagnol', level: 'B1' },
          reason,
        }),
      )
      expect(end.languages.map((l) => l.name)).toEqual(['Anglais', 'Espagnol'])
      const clamped = applied(
        applyCvOperation(sampleCv(), {
          op: 'add_item',
          section: 'languages',
          position: -5,
          item: { name: 'Espagnol' },
          reason,
        }),
      )
      expect(clamped.languages[0]!.name).toBe('Espagnol')
    })

    it('refuses empty items, too long fields and full sections', () => {
      expect(
        failure(
          applyCvOperation(sampleCv(), {
            op: 'add_item',
            section: 'languages',
            position: null,
            item: { degree: 'not a language field' },
            reason,
          }),
        ),
      ).toContain('vide')
      expect(
        failure(
          applyCvOperation(sampleCv(), {
            op: 'add_item',
            section: 'languages',
            position: null,
            item: { name: 'x'.repeat(500) },
            reason,
          }),
        ),
      ).toContain('trop long')
      const full = sampleCv()
      full.languages = Array.from({ length: CV_LIMITS.languages }, (_, i) => ({
        id: `g${i + 10}`,
        name: 'L',
        level: '',
      }))
      expect(
        failure(
          applyCvOperation(full, {
            op: 'add_item',
            section: 'languages',
            position: null,
            item: { name: 'Une de trop' },
            reason,
          }),
        ),
      ).toContain('maximum')
    })

    it('removes and moves items', () => {
      const removed = applied(
        applyCvOperation(sampleCv(), {
          op: 'remove_item',
          section: 'experiences',
          itemId: 'e1',
          reason,
        }),
      )
      expect(removed.experiences.map((e) => e.id)).toEqual(['e2'])
      const moved = applied(
        applyCvOperation(sampleCv(), {
          op: 'move_item',
          section: 'experiences',
          itemId: 'e1',
          toIndex: 99,
          reason,
        }),
      )
      expect(moved.experiences.map((e) => e.id)).toEqual(['e2', 'e1'])
      expect(
        failure(
          applyCvOperation(sampleCv(), {
            op: 'move_item',
            section: 'experiences',
            itemId: 'nope',
            toIndex: 0,
            reason,
          }),
        ),
      ).toContain('introuvable')
    })
  })

  describe('sections', () => {
    it('hides, shows and renames a section; null leaves a property unchanged', () => {
      const hidden = applied(
        applyCvOperation(sampleCv(), {
          op: 'set_section',
          section: 'languages',
          visible: false,
          title: null,
          reason,
        }),
      )
      expect(hidden.sections.find((s) => s.key === 'languages')).toEqual({
        key: 'languages',
        title: '',
        visible: false,
      })
      const renamed = applied(
        applyCvOperation(hidden, {
          op: 'set_section',
          section: 'languages',
          visible: null,
          title: 'Langues parlées',
          reason,
        }),
      )
      expect(renamed.sections.find((s) => s.key === 'languages')).toEqual({
        key: 'languages',
        title: 'Langues parlées',
        visible: false,
      })
    })

    it('moves a section, clamped', () => {
      const cv = applied(
        applyCvOperation(sampleCv(), {
          op: 'move_section',
          section: 'skills',
          toIndex: -1,
          reason,
        }),
      )
      expect(cv.sections[0]!.key).toBe('skills')
      expect(cv.sections).toHaveLength(8)
    })
  })
})

describe('applyCvOperations', () => {
  const ops: CvOperation[] = [
    { op: 'remove_item', section: 'experiences', itemId: 'e2', reason },
    {
      op: 'set_bullet',
      section: 'experiences',
      itemId: 'e2',
      bulletId: 'b3',
      text: 'Réécrite',
      reason,
    },
    {
      op: 'set_bullet',
      section: 'experiences',
      itemId: 'e1',
      bulletId: 'b1',
      text: 'Réécrite',
      reason,
    },
  ]

  it('applies in order and reports the operations that no longer apply', () => {
    const { content, results } = applyCvOperations(sampleCv(), ops)
    expect(results.map((r) => r.ok)).toEqual([true, false, true])
    expect(results[1]!.reason).toContain('introuvable')
    expect(content.experiences).toHaveLength(1)
    expect(content.experiences[0]!.bullets[0]!.text).toBe('Réécrite')
  })

  it('applies any subset independently, since operations target ids', () => {
    const { content, results } = applyCvOperations(sampleCv(), [ops[1]!, ops[2]!])
    expect(results.every((r) => r.ok)).toBe(true)
    expect(content.experiences[1]!.bullets[0]!.text).toBe('Réécrite')
  })
})

/** A flat operation as Claude writes it, every field present. */
function wire(fields: Partial<CvOperationWire> & Pick<CvOperationWire, 'op'>): CvOperationWire {
  return {
    section: null,
    itemId: null,
    bulletId: null,
    field: null,
    value: null,
    list: null,
    fields: null,
    index: null,
    visible: null,
    reason,
    ...fields,
  }
}

describe('parseCvEditOutput', () => {
  it('converts flat operations into typed ones', () => {
    const proposal = parseCvEditOutput({
      summary: 'Des changements.',
      operations: [
        wire({ op: 'set_header', field: 'title', value: 'Responsable com' }),
        wire({
          op: 'set_bullet',
          section: 'experiences',
          itemId: 'e1',
          bulletId: 'b1',
          value: 'Réécrite',
        }),
        wire({
          op: 'add_bullet',
          section: 'experiences',
          itemId: 'e1',
          bulletId: null,
          value: 'Nouvelle',
        }),
        wire({ op: 'set_skills', itemId: 's1', list: ['Canva', 'Figma'] }),
        wire({
          op: 'add_item',
          section: 'experiences',
          index: 1,
          fields: [
            { name: 'title', value: 'Stagiaire' },
            { name: 'organization', value: 'Agence Pixel' },
          ],
          list: ['Visuels des réseaux sociaux'],
        }),
        wire({
          op: 'add_item',
          section: 'skills',
          fields: [{ name: 'name', value: 'Outils' }],
          list: ['Figma'],
        }),
        wire({ op: 'move_item', section: 'experiences', itemId: 'e2', index: 0 }),
        wire({ op: 'set_section', section: 'languages', visible: false, value: null }),
        wire({ op: 'move_section', section: 'skills', index: 1 }),
      ],
    })
    expect(proposal!.dropped).toBe(0)
    expect(proposal!.operations).toEqual([
      { op: 'set_header', field: 'title', value: 'Responsable com', reason },
      {
        op: 'set_bullet',
        section: 'experiences',
        itemId: 'e1',
        bulletId: 'b1',
        text: 'Réécrite',
        reason,
      },
      {
        op: 'add_bullet',
        section: 'experiences',
        itemId: 'e1',
        afterBulletId: null,
        text: 'Nouvelle',
        reason,
      },
      { op: 'set_skills', itemId: 's1', items: ['Canva', 'Figma'], reason },
      {
        op: 'add_item',
        section: 'experiences',
        position: 1,
        item: {
          title: 'Stagiaire',
          organization: 'Agence Pixel',
          bullets: ['Visuels des réseaux sociaux'],
        },
        reason,
      },
      {
        op: 'add_item',
        section: 'skills',
        position: null,
        item: { name: 'Outils', items: ['Figma'] },
        reason,
      },
      { op: 'move_item', section: 'experiences', itemId: 'e2', toIndex: 0, reason },
      { op: 'set_section', section: 'languages', visible: false, title: null, reason },
      { op: 'move_section', section: 'skills', toIndex: 1, reason },
    ])
    // And they apply to the document.
    const { results } = applyCvOperations(sampleCv(), proposal!.operations)
    expect(results.every((result) => result.ok)).toBe(true)
  })

  it('drops invalid operations and counts them', () => {
    const proposal = parseCvEditOutput({
      summary: 'Deux changements.',
      operations: [
        wire({ op: 'set_summary', value: 'Accroche' }),
        wire({ op: 'set_summary', value: null }), // no value
        wire({ op: 'set_header', field: 'password', value: 'x' }), // not a header field
        { op: 'delete_everything', reason }, // unknown kind
        wire({ op: 'set_bullet', section: 'education', itemId: 'd1', bulletId: 'b1', value: 'x' }), // no bullets there
        wire({ op: 'move_section', section: 'skills', index: 0 }),
      ],
    })
    expect(proposal).toMatchObject({ summary: 'Deux changements.', dropped: 4 })
    expect(proposal!.operations.map((op) => op.op)).toEqual(['set_summary', 'move_section'])
  })

  it('returns null when the answer is not a proposal', () => {
    expect(parseCvEditOutput({ text: 'Bonjour' })).toBeNull()
    expect(parseCvEditOutput(null)).toBeNull()
  })
})

describe('describeCvOperation', () => {
  it('describes an edit with its target, before and after', () => {
    const description = describeCvOperation(sampleCv(), {
      op: 'set_bullet',
      section: 'experiences',
      itemId: 'e1',
      bulletId: 'b2',
      text: 'Rédaction de 30 communiqués',
      reason,
    })
    expect(description).toEqual({
      kind: 'edit',
      target: 'Expérience · Chargée de communication · Agence Lumière · puce',
      before: 'Rédaction de communiqués de presse',
      after: 'Rédaction de 30 communiqués',
      problem: null,
    })
  })

  it('describes additions, removals and moves', () => {
    const cv = sampleCv()
    expect(
      describeCvOperation(cv, {
        op: 'add_item',
        section: 'languages',
        position: null,
        item: { name: 'Espagnol', level: 'B1' },
        reason,
      }),
    ).toMatchObject({ kind: 'add', before: null, after: 'Espagnol · B1' })
    expect(
      describeCvOperation(cv, { op: 'remove_item', section: 'education', itemId: 'd1', reason }),
    ).toMatchObject({
      kind: 'remove',
      before: 'Master Communication · Université Lyon 2',
      after: null,
    })
    expect(
      describeCvOperation(cv, { op: 'move_section', section: 'skills', toIndex: 1, reason }),
    ).toMatchObject({ kind: 'move', before: 'Position 4', after: 'Position 2' })
    expect(
      describeCvOperation(cv, { op: 'set_header', field: 'city', value: 'Paris', reason }),
    ).toMatchObject({ target: 'En-tête · Ville', before: 'Lyon', after: 'Paris' })
  })

  it('reports why an operation cannot apply', () => {
    const description = describeCvOperation(sampleCv(), {
      op: 'remove_bullet',
      section: 'experiences',
      itemId: 'e1',
      bulletId: 'gone',
      reason,
    })
    expect(description.problem).toContain('introuvable')
    expect(description.before).toBeNull()
  })
})

describe('diffWords', () => {
  it('marks added and removed words', () => {
    expect(diffWords('Gestion des réseaux sociaux', 'Gestion de 4 réseaux sociaux')).toEqual([
      { type: 'same', text: 'Gestion ' },
      { type: 'removed', text: 'des ' },
      { type: 'added', text: 'de 4 ' },
      { type: 'same', text: 'réseaux sociaux' },
    ])
  })

  it('keeps a word unchanged when punctuation is added after it', () => {
    const parts = diffWords('le magazine municipal', 'le magazine municipal, diffusé')
    expect(parts).toEqual([
      { type: 'same', text: 'le magazine municipal' },
      { type: 'added', text: ', diffusé' },
    ])
  })

  it('handles empty sides', () => {
    expect(diffWords('', 'Nouveau')).toEqual([{ type: 'added', text: 'Nouveau' }])
    expect(diffWords('Ancien', '')).toEqual([{ type: 'removed', text: 'Ancien' }])
  })

  it('reconstructs both texts', () => {
    const before = 'Organisation de la fête de quartier annuelle'
    const after = 'Organisation de 3 événements de quartier par an'
    const parts = diffWords(before, after)
    expect(
      parts
        .filter((p) => p.type !== 'added')
        .map((p) => p.text)
        .join(''),
    ).toBe(before)
    expect(
      parts
        .filter((p) => p.type !== 'removed')
        .map((p) => p.text)
        .join(''),
    ).toBe(after)
  })
})
