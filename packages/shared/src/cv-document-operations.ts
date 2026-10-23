import type { CvContent } from './cv'
import {
  cvBulletStyleLabels,
  cvFontPairings,
  cvHeaderStyleLabels,
  cvItemStyleLabels,
  cvLanguageStyleLabels,
  cvLayoutLabels,
  cvLineHeightLabels,
  cvMarginLabels,
  cvSectionTitleStyleLabels,
  cvSkillStyleLabels,
  cvSpacingLabels,
  resetCvDesign,
  type CvDesign,
} from './cv-design'
import {
  applyCvOperation,
  describeCvOperation,
  isCvDesignOperation,
  type CvDesignChangeKey,
  type CvDesignChangeLine,
  type CvDesignChanges,
  type CvDesignOperation,
  type CvOperation,
  type CvOperationDescription,
  type CvOperationResult,
} from './cv-operations'
import {
  cvAtsLevelLabels,
  cvTemplates,
  isTwoColumnLayout,
  resolveCvDesign,
  type CvAtsLevel,
  type CvTemplateId,
  type ResolvedCvDesign,
} from './cv-templates'

/**
 * Operations on the whole document. Content operations change the content
 * only (cv-operations.ts); design operations (`set_template`, `set_design`)
 * change the template and the design overrides. The editor applies a
 * proposal with `applyCvOperationsToDocument` and describes each operation
 * with `describeCvOperationInDocument`.
 */

/** What an operation can change: the three parts of a CV document. */
export interface CvDocumentState {
  content: CvContent
  design: CvDesign
  templateId: CvTemplateId
}

export type CvDocumentApplyResult =
  { ok: true; state: CvDocumentState } | { ok: false; reason: string }

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const PALETTE_KEYS = ['primary', 'secondary', 'sidebarBg'] as const

/** Applies one design operation to a copy of the design. Never throws. */
function applyDesignOperation(
  state: CvDocumentState,
  op: CvDesignOperation,
): CvDocumentApplyResult {
  if (op.op === 'set_template') {
    if (op.templateId === state.templateId && !op.resetDesign) {
      return { ok: false, reason: 'Ce modèle est déjà celui du CV.' }
    }
    return {
      ok: true,
      state: {
        ...state,
        templateId: op.templateId,
        design: op.resetDesign ? resetCvDesign(state.design) : copy(state.design),
      },
    }
  }

  const design = copy(state.design)
  const record = design as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(op.changes) as Array<
    [CvDesignChangeKey, string | number | boolean | null | undefined]
  >) {
    if (value === undefined) continue
    if ((PALETTE_KEYS as readonly string[]).includes(key)) {
      const palette = design.palette as Record<string, string | undefined>
      palette[key] = value === null ? undefined : String(value).toLowerCase()
    } else record[key] = value === null ? undefined : value
  }
  // The JSON copy drops the cleared (undefined) settings: absent = the template's value.
  const next = copy(design)
  if (JSON.stringify(next) === JSON.stringify(state.design)) {
    return { ok: false, reason: 'Ces réglages sont déjà appliqués.' }
  }
  return { ok: true, state: { ...state, design: next } }
}

/**
 * Applies one operation, content or design, to a copy of the document.
 * Never throws: an operation that cannot apply returns a French reason.
 */
export function applyCvOperationToDocument(
  state: CvDocumentState,
  op: CvOperation,
): CvDocumentApplyResult {
  if (isCvDesignOperation(op)) return applyDesignOperation(state, op)
  const result = applyCvOperation(state.content, op)
  return result.ok ? { ok: true, state: { ...state, content: result.content } } : result
}

/** Applies operations in order, skipping (and reporting) those that cannot apply. */
export function applyCvOperationsToDocument(
  state: CvDocumentState,
  operations: CvOperation[],
): { state: CvDocumentState; results: CvOperationResult[] } {
  let current = state
  const results: CvOperationResult[] = []
  operations.forEach((op, index) => {
    const result = applyCvOperationToDocument(current, op)
    if (result.ok) {
      current = result.state
      results.push({ index, ok: true })
    } else {
      results.push({ index, ok: false, reason: result.reason })
    }
  })
  return { state: current, results }
}

// --- Description (proposal review UI) ----------------------------------------------

const SETTING_LABELS: Record<CvDesignChangeKey, string> = {
  primary: 'Couleur principale',
  secondary: 'Couleur secondaire',
  sidebarBg: 'Fond de la colonne latérale',
  fontPairing: 'Polices',
  layout: 'Mise en page',
  headerStyle: 'En-tête',
  sectionTitleStyle: 'Titres de section',
  itemStyle: 'Expériences et formations',
  bulletStyle: 'Puces',
  skillStyle: 'Compétences',
  languageStyle: 'Langues',
  spacing: 'Espacement',
  lineHeight: 'Interligne',
  margins: 'Marges',
  fontSize: 'Taille du texte',
  showIcons: 'Icônes',
}

const FONT_SIZE_LABELS: Record<number, string> = {
  [-2]: 'Beaucoup plus petite',
  [-1]: 'Plus petite',
  0: 'Normale',
  1: 'Plus grande',
  2: 'Beaucoup plus grande',
}

/** A resolved setting as the review shows it; colors are shown as swatches next to their hex code. */
function settingValue(
  key: CvDesignChangeKey,
  design: ResolvedCvDesign,
): { text: string; color?: string } {
  switch (key) {
    case 'primary':
    case 'secondary':
    case 'sidebarBg':
      return { text: design.palette[key], color: design.palette[key] }
    case 'fontPairing':
      return { text: cvFontPairings[design.fontPairing].label }
    case 'layout':
      return { text: cvLayoutLabels[design.layout] }
    case 'headerStyle':
      return { text: cvHeaderStyleLabels[design.headerStyle] }
    case 'sectionTitleStyle':
      return { text: cvSectionTitleStyleLabels[design.sectionTitleStyle] }
    case 'itemStyle':
      return { text: cvItemStyleLabels[design.itemStyle] }
    case 'bulletStyle':
      return { text: cvBulletStyleLabels[design.bulletStyle] }
    case 'skillStyle':
      return { text: cvSkillStyleLabels[design.skillStyle] }
    case 'languageStyle':
      return { text: cvLanguageStyleLabels[design.languageStyle] }
    case 'spacing':
      return { text: cvSpacingLabels[design.spacing] }
    case 'lineHeight':
      return { text: cvLineHeightLabels[design.lineHeight] }
    case 'margins':
      return { text: cvMarginLabels[design.margins] }
    case 'fontSize':
      return { text: FONT_SIZE_LABELS[design.fontSize] ?? String(design.fontSize) }
    case 'showIcons':
      return { text: design.showIcons ? 'Affichées' : 'Masquées' }
  }
}

const ATS_RANK: Record<CvAtsLevel, number> = { optimal: 0, bon: 1, limite: 2 }

/** The ATS warning shown when an operation makes the CV harder for recruiting software to read. */
function atsWarning(before: ResolvedCvDesign, after: ResolvedCvDesign): string | null {
  const from = cvTemplates[before.templateId]
  const to = cvTemplates[after.templateId]
  const advice =
    'Parfait pour envoyer à une personne (agence, réseau, contact direct), à éviter sur un portail d’emploi.'
  if (ATS_RANK[to.atsLevel] > ATS_RANK[from.atsLevel]) {
    return `Attention aux candidatures en ligne : ${cvAtsLevelLabels[to.atsLevel]}. Les logiciels de recrutement (ATS) lisent mal les colonnes, les bandeaux et les icônes. ${advice}`
  }
  if (!isTwoColumnLayout(before.layout) && isTwoColumnLayout(after.layout)) {
    return `Attention aux candidatures en ligne : deux colonnes sont parfois lues dans le désordre par les logiciels de recrutement (ATS). ${advice}`
  }
  return null
}

function describeDesignOperation(
  op: CvDesignOperation,
  state: CvDocumentState | null,
): CvOperationDescription {
  const result = state ? applyDesignOperation(state, op) : null
  const problem = result && !result.ok ? result.reason : null
  const base = { kind: 'design' as const, before: null, after: null, problem }
  const resolve = (s: CvDocumentState) => resolveCvDesign(cvTemplates[s.templateId], s.design)
  const before = state ? resolve(state) : null
  const after = result?.ok ? resolve(result.state) : null
  const warning = before && after ? atsWarning(before, after) : null

  if (op.op === 'set_template') {
    const line: CvDesignChangeLine = {
      label: 'Modèle',
      before: state ? cvTemplates[state.templateId].label : null,
      after: cvTemplates[op.templateId].label,
    }
    const lines = [line]
    if (op.resetDesign) {
      lines.push({
        label: 'Personnalisations',
        before: 'Tes couleurs, polices et styles',
        after: 'Remplacées par ceux du modèle',
      })
    }
    return { ...base, target: 'Modèle du CV', design: lines, warning }
  }

  const keys = (Object.keys(op.changes) as CvDesignChangeKey[]).filter(
    (key) => op.changes[key] !== undefined,
  )
  const lines: CvDesignChangeLine[] = []
  for (const key of keys) {
    const next = after
      ? settingValue(key, after)
      : // Not applicable (or no document to compare with): show what was asked.
        { text: describeRequested(key, op.changes), color: colorOf(key, op.changes) }
    const previous = before ? settingValue(key, before) : null
    if (previous && after && previous.text === next.text) continue
    lines.push({
      label: SETTING_LABELS[key],
      before: previous?.text ?? null,
      after: next.text,
      beforeColor: previous?.color,
      afterColor: next.color,
    })
  }
  return { ...base, target: 'Design du CV', design: lines, warning }
}

function colorOf(key: CvDesignChangeKey, changes: CvDesignChanges): string | undefined {
  const value = changes[key]
  return (PALETTE_KEYS as readonly string[]).includes(key) && typeof value === 'string'
    ? value
    : undefined
}

function describeRequested(key: CvDesignChangeKey, changes: CvDesignChanges): string {
  const value = changes[key]
  return value === null || value === undefined ? 'Valeur du modèle' : String(value)
}

/**
 * Describes an operation against the whole document, for the review UI: the
 * content descriptions of `describeCvOperation`, plus design lines (readable
 * French diffs and swatches) and the ATS trade-off for design operations.
 */
export function describeCvOperationInDocument(
  state: CvDocumentState,
  op: CvOperation,
): CvOperationDescription {
  return isCvDesignOperation(op)
    ? describeDesignOperation(op, state)
    : describeCvOperation(state.content, op)
}
