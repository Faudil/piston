import { describe, expect, it } from 'vitest'
import {
  CvDesign,
  CvOperation,
  applyCvOperationToDocument,
  applyCvOperationsToDocument,
  applyCvOperation,
  cvCompleteness,
  createBlankCv,
  describeCvOperationInDocument,
  parseCvEditOutput,
  parseCvQuestionsOutput,
  type CvDocumentState,
  type CvOperationWire,
} from '../src'
import { sampleCv } from './cv-fixture'

const reason = 'Parce que.'

function state(overrides: Partial<CvDocumentState> = {}): CvDocumentState {
  return {
    content: sampleCv(),
    design: CvDesign.parse({}),
    templateId: 'sobre',
    ...overrides,
  }
}

const none: CvOperationWire = {
  op: 'set_header',
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

function ok(result: ReturnType<typeof applyCvOperationToDocument>): CvDocumentState {
  if (!result.ok) throw new Error(`expected success, got: ${result.reason}`)
  expect(CvDesign.safeParse(result.state.design).success).toBe(true)
  return result.state
}

describe('set_template', () => {
  it('changes the template and keeps the design customizations', () => {
    const before = state({ design: CvDesign.parse({ palette: { primary: '#1d4ed8' } }) })
    const after = ok(
      applyCvOperationToDocument(before, {
        op: 'set_template',
        templateId: 'compact',
        resetDesign: false,
        reason,
      }),
    )
    expect(after.templateId).toBe('compact')
    expect(after.design.palette.primary).toBe('#1d4ed8')
    expect(before.templateId).toBe('sobre')
  })

  it('resets the customizations on request, keeping language and page format', () => {
    const before = state({
      design: CvDesign.parse({ language: 'en', pageFormat: 'Letter', fontPairing: 'eb-garamond' }),
    })
    const after = ok(
      applyCvOperationToDocument(before, {
        op: 'set_template',
        templateId: 'moderne',
        resetDesign: true,
        reason,
      }),
    )
    expect(after.design.fontPairing).toBeUndefined()
    expect(after.design.language).toBe('en')
    expect(after.design.pageFormat).toBe('Letter')
  })

  it('refuses the template already in use', () => {
    const result = applyCvOperationToDocument(state(), {
      op: 'set_template',
      templateId: 'sobre',
      resetDesign: false,
      reason,
    })
    expect(result).toEqual({ ok: false, reason: 'Ce modèle est déjà celui du CV.' })
  })
})

describe('set_design', () => {
  it('sets palette colors and styles, and clears a setting with null', () => {
    const before = state({ design: CvDesign.parse({ spacing: 'compact' }) })
    const after = ok(
      applyCvOperationToDocument(before, {
        op: 'set_design',
        changes: { primary: '#0F172A', fontPairing: 'source', spacing: null, fontSize: -1 },
        reason,
      }),
    )
    expect(after.design.palette.primary).toBe('#0f172a')
    expect(after.design.fontPairing).toBe('source')
    expect(after.design.spacing).toBeUndefined()
    expect(after.design.fontSize).toBe(-1)
    expect(before.design.palette.primary).toBeUndefined()
  })

  it('refuses a change that changes nothing', () => {
    const result = applyCvOperationToDocument(state(), {
      op: 'set_design',
      changes: { spacing: null },
      reason,
    })
    expect(result.ok).toBe(false)
  })

  it('applies design and content operations in order and reports the ones that fail', () => {
    const { state: next, results } = applyCvOperationsToDocument(state(), [
      { op: 'set_summary', value: 'Nouvelle accroche', reason },
      { op: 'set_design', changes: { layout: 'banner' }, reason },
      { op: 'set_template', templateId: 'sobre', resetDesign: false, reason },
    ])
    expect(next.content.summary).toBe('Nouvelle accroche')
    expect(next.design.layout).toBe('banner')
    expect(results.map((result) => result.ok)).toEqual([true, true, false])
  })

  it('is not applied by the content-only function', () => {
    const result = applyCvOperation(sampleCv(), {
      op: 'set_design',
      changes: { layout: 'banner' },
      reason,
    })
    expect(result.ok).toBe(false)
  })
})

describe('validation', () => {
  it('rejects unknown ids, colors and empty or unknown settings', () => {
    const bad = (value: unknown) => CvOperation.safeParse(value).success
    expect(bad({ op: 'set_template', templateId: 'inconnu', resetDesign: false, reason })).toBe(
      false,
    )
    expect(bad({ op: 'set_design', changes: { primary: 'rouge' }, reason })).toBe(false)
    expect(bad({ op: 'set_design', changes: { fontSize: 5 }, reason })).toBe(false)
    expect(bad({ op: 'set_design', changes: { layout: 'masonry' }, reason })).toBe(false)
    expect(bad({ op: 'set_design', changes: {}, reason })).toBe(false)
    expect(bad({ op: 'set_design', changes: { pageFormat: 'A3' }, reason })).toBe(false)
    expect(bad({ op: 'set_design', changes: { layout: 'banner' }, reason })).toBe(true)
  })

  it('parses the flat wire form and drops invalid design operations', () => {
    const proposal = parseCvEditOutput({
      summary: 'Plus sobre.',
      operations: [
        { ...none, op: 'set_template', value: 'compact', visible: false },
        {
          ...none,
          op: 'set_design',
          fields: [
            { name: 'primary', value: '#1E3A8A' },
            { name: 'fontSize', value: '-1' },
            { name: 'spacing', value: 'default' },
            { name: 'showIcons', value: 'false' },
          ],
        },
        { ...none, op: 'set_template', value: 'inexistant', visible: false },
        { ...none, op: 'set_design', fields: [{ name: 'palette.primary', value: '#fff' }] },
        { ...none, op: 'set_design', fields: [{ name: 'layout', value: 'masonry' }] },
        { ...none, op: 'set_design', fields: [] },
      ],
    })
    expect(proposal?.dropped).toBe(4)
    expect(proposal?.operations).toEqual([
      { op: 'set_template', templateId: 'compact', resetDesign: false, reason },
      {
        op: 'set_design',
        changes: { primary: '#1e3a8a', fontSize: -1, spacing: null, showIcons: false },
        reason,
      },
    ])
  })
})

describe('describeCvOperationInDocument', () => {
  it('shows a template change as a readable line and warns about ATS', () => {
    const description = describeCvOperationInDocument(state(), {
      op: 'set_template',
      templateId: 'moderne',
      resetDesign: false,
      reason,
    })
    expect(description.kind).toBe('design')
    expect(description.design).toEqual([{ label: 'Modèle', before: 'Sobre', after: 'Moderne' }])
    expect(description.warning).toContain('candidatures en ligne')
    expect(description.problem).toBeNull()
  })

  it('does not warn when the ATS reading improves', () => {
    const description = describeCvOperationInDocument(state({ templateId: 'moderne' }), {
      op: 'set_template',
      templateId: 'sobre',
      resetDesign: false,
      reason,
    })
    expect(description.warning).toBeNull()
  })

  it('lists changed settings with swatches, skipping those that do not change', () => {
    const description = describeCvOperationInDocument(state(), {
      op: 'set_design',
      changes: { primary: '#1d4ed8', spacing: 'normal', layout: 'sidebar-left' },
      reason,
    })
    expect(description.design?.map((line) => line.label)).toEqual([
      'Couleur principale',
      'Mise en page',
    ])
    expect(description.design?.[0]).toMatchObject({
      before: '#c8410b',
      beforeColor: '#c8410b',
      after: '#1d4ed8',
      afterColor: '#1d4ed8',
    })
    expect(description.design?.[1]).toMatchObject({
      before: 'Une colonne',
      after: 'Colonne latérale à gauche',
    })
    expect(description.warning).toContain('colonnes')
  })

  it('reports a problem for an operation that cannot apply', () => {
    const description = describeCvOperationInDocument(state(), {
      op: 'set_template',
      templateId: 'sobre',
      resetDesign: false,
      reason,
    })
    expect(description.problem).toBe('Ce modèle est déjà celui du CV.')
  })

  it('delegates content operations', () => {
    const description = describeCvOperationInDocument(state(), {
      op: 'set_summary',
      value: 'Autre',
      reason,
    })
    expect(description).toMatchObject({ kind: 'edit', target: 'Accroche', after: 'Autre' })
  })
})

describe('questions step', () => {
  it('keeps at most three non-empty questions as a proposal without operations', () => {
    const proposal = parseCvQuestionsOutput({
      summary: 'Il manque le périmètre.',
      questions: [
        { question: 'Combien de clients ?', hint: 'Ex. : une dizaine' },
        { question: '  ', hint: '' },
        { question: 'Quels outils ?', hint: 'Ex. : Canva' },
        { question: 'Quel résultat ?', hint: 'Ex. : plus d’abonnés' },
        { question: 'Une de trop ?', hint: '' },
      ],
    })
    expect(proposal?.operations).toEqual([])
    expect(proposal?.questions?.map((entry) => entry.question)).toEqual([
      'Combien de clients ?',
      'Quels outils ?',
      'Quel résultat ?',
    ])
    expect(parseCvQuestionsOutput({ summary: '', questions: [] })).toBeNull()
    expect(parseCvQuestionsOutput('x')).toBeNull()
  })
})

describe('cvCompleteness', () => {
  it('scores a full CV 100 and lists what a blank one misses, most important first', () => {
    expect(cvCompleteness(sampleCv()).score).toBeGreaterThanOrEqual(90)
    const blank = cvCompleteness(createBlankCv('Camille'))
    expect(blank.score).toBeLessThan(20)
    expect(blank.missing[0]).toContain('expérience')
  })

  it('counts placeholders against the score', () => {
    const content = sampleCv()
    const complete = cvCompleteness(content).score
    content.experiences[0]!.bullets[0]!.text = 'Hausse de [X %] des abonnés'
    expect(cvCompleteness(content).score).toBe(complete - 5)
  })
})
