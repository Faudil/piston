import {
  type CvCefr,
  type CvListSectionKey,
  type CvSectionKey,
  CV_SKILL_MAX_LEVEL,
  cvCefrLabels,
  cvCustomItemFieldLabels,
  cvCustomItemFields,
  cvFieldLabels,
  cvHeaderFieldLabels,
  cvItemLabel,
  cvItemTextFields,
  cvSectionTitles,
  type CvContent,
  type CvItem,
  type CvSectionConfig,
} from './cv'
import {
  applyCvOperation,
  bulletsOf,
  clampIndex,
  findCustom,
  findItem,
  sectionIndex,
} from './cv-operations-apply'
import type { CvCustomItemDraft, CvItemDraft, CvOperation } from './cv-operations-schema'

// --- Description (proposal review UI) ----------------------------------------------

export type CvChangeKind = 'edit' | 'add' | 'remove' | 'move' | 'section' | 'design'

export interface CvOperationDescription {
  kind: CvChangeKind
  /** Where the change happens, in French (« Expérience · Chargée de com · Agence X »). */
  target: string
  /** Text before the change; null for additions. */
  before: string | null
  /** Text after the change; null for removals. */
  after: string | null
  /** Why it cannot apply to this document, or null. */
  problem: string | null
  /** Design operations: one line per setting that changes (the text above stays null). */
  design?: CvDesignChangeLine[]
  /** A trade-off the user should know before accepting (e.g. a template that ATS read badly). */
  warning?: string | null
}

/** One setting of a design change: « Modèle : Moderne → Classique », with swatches for colors. */
export interface CvDesignChangeLine {
  label: string
  /** The current value; null when the description has no design to compare with. */
  before: string | null
  after: string
  /** `#rrggbb` of the values that are colors, to draw swatches. */
  beforeColor?: string
  afterColor?: string
}

const SECTION_SINGULAR: Record<CvSectionKey, string> = {
  summary: 'Accroche',
  experiences: 'Expérience',
  education: 'Formation',
  skills: 'Compétences',
  languages: 'Langue',
  projects: 'Projet',
  certifications: 'Certification',
  interests: 'Centre d’intérêt',
  volunteering: 'Bénévolat',
  awards: 'Distinction',
  publications: 'Publication',
  references: 'Référence',
  extras: 'Information complémentaire',
}

const COLUMN_LABELS = {
  auto: 'colonne par défaut',
  main: 'colonne principale',
  side: 'colonne latérale',
}

function itemTarget(content: CvContent, section: CvListSectionKey, id: string): string {
  const item = findItem(content, section, id)
  return item
    ? `${SECTION_SINGULAR[section]} · ${cvItemLabel(section, item)}`
    : SECTION_SINGULAR[section]
}

function customTarget(content: CvContent, customId: string, itemId?: string): string {
  const section = findCustom(content, customId)
  if (!section) return 'Section personnalisée'
  const item = itemId ? section.items.find((entry) => entry.id === itemId) : undefined
  const itemLabel = item ? item.title.trim() || item.text.trim().slice(0, 40) || 'Sans titre' : ''
  return [`Section « ${section.title || 'Sans titre'} »`, itemLabel].filter(Boolean).join(' · ')
}

/** Display title of a section entry, in French (the review UI is French). */
function sectionName(content: CvContent, section: CvSectionConfig): string {
  if (section.key === 'custom') return findCustom(content, section.customId)?.title || 'Sans titre'
  return section.title || cvSectionTitles.fr[section.key]
}

/** Readable one-line text of an item draft, for additions. */
function draftText(section: CvListSectionKey, draft: CvItemDraft): string {
  const record = draft as Record<string, unknown>
  const fields = (cvItemTextFields[section] as readonly string[])
    .map((field) => record[field])
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
  const lists = [
    ...(draft.bullets ?? []).map((bullet) => `• ${bullet}`),
    ...(draft.items?.length ? [draft.items.join(', ')] : []),
  ]
  return [fields.join(' · '), ...lists].filter(Boolean).join('\n')
}

const customDraftText = (draft: CvCustomItemDraft) =>
  cvCustomItemFields
    .map((field) => draft[field]?.trim())
    .filter(Boolean)
    .join(' · ')

/** Describes an operation against a document, for the review UI. Pure, never throws. */
export function describeCvOperation(content: CvContent, op: CvOperation): CvOperationDescription {
  const result = applyCvOperation(content, op)
  const problem = result.ok ? null : result.reason
  const base = { problem }

  switch (op.op) {
    case 'set_header':
      return {
        ...base,
        kind: 'edit',
        target: `En-tête · ${cvHeaderFieldLabels[op.field]}`,
        before: content.header[op.field],
        after: op.value,
      }
    case 'set_summary':
      return { ...base, kind: 'edit', target: 'Accroche', before: content.summary, after: op.value }
    case 'set_field': {
      const item = findItem(content, op.section, op.itemId) as unknown as
        Record<string, string> | undefined
      const label = (cvFieldLabels[op.section] as Record<string, string>)[op.field] ?? op.field
      return {
        ...base,
        kind: 'edit',
        target: `${itemTarget(content, op.section, op.itemId)} · ${label}`,
        before: item?.[op.field] ?? null,
        after: op.value,
      }
    }
    case 'set_skills': {
      const group = content.skills.find((entry) => entry.id === op.itemId)
      return {
        ...base,
        kind: 'edit',
        target: itemTarget(content, 'skills', op.itemId),
        before: group ? group.items.map((skill) => skill.name).join(', ') : null,
        after: op.items.join(', '),
      }
    }
    case 'set_skill_level': {
      const skill = content.skills
        .find((entry) => entry.id === op.itemId)
        ?.items.find((entry) => entry.id === op.skillId)
      const level = (value: number) =>
        value ? `Niveau ${value}/${CV_SKILL_MAX_LEVEL}` : 'Sans niveau'
      return {
        ...base,
        kind: 'edit',
        target: `${itemTarget(content, 'skills', op.itemId)} · ${skill?.name ?? 'compétence'}`,
        before: skill ? level(skill.level) : null,
        after: level(op.level),
      }
    }
    case 'set_language_cefr': {
      const language = content.languages.find((entry) => entry.id === op.itemId)
      const label = (cefr: CvCefr | null) => (cefr ? cvCefrLabels[cefr] : 'Aucun niveau CECRL')
      return {
        ...base,
        kind: 'edit',
        target: `${itemTarget(content, 'languages', op.itemId)} · niveau CECRL`,
        before: language ? label(language.cefr) : null,
        after: label(op.cefr),
      }
    }
    case 'set_bullet': {
      const bullet = bulletsOf(content, op.section, op.itemId)?.find(
        (entry) => entry.id === op.bulletId,
      )
      return {
        ...base,
        kind: 'edit',
        target: `${itemTarget(content, op.section, op.itemId)} · puce`,
        before: bullet?.text ?? null,
        after: op.text,
      }
    }
    case 'add_bullet':
      return {
        ...base,
        kind: 'add',
        target: `${itemTarget(content, op.section, op.itemId)} · nouvelle puce`,
        before: null,
        after: op.text,
      }
    case 'remove_bullet': {
      const bullet = bulletsOf(content, op.section, op.itemId)?.find(
        (entry) => entry.id === op.bulletId,
      )
      return {
        ...base,
        kind: 'remove',
        target: `${itemTarget(content, op.section, op.itemId)} · puce`,
        before: bullet?.text ?? null,
        after: null,
      }
    }
    case 'add_item':
      return {
        ...base,
        kind: 'add',
        target: `${SECTION_SINGULAR[op.section]} · nouvel élément`,
        before: null,
        after: draftText(op.section, op.item),
      }
    case 'remove_item': {
      const item = findItem(content, op.section, op.itemId)
      return {
        ...base,
        kind: 'remove',
        target: itemTarget(content, op.section, op.itemId),
        before: item ? cvItemLabel(op.section, item) : null,
        after: null,
      }
    }
    case 'move_item': {
      const list = content[op.section] as CvItem[]
      const index = list.findIndex((item) => item.id === op.itemId)
      const to = clampIndex(op.toIndex, list.length - 1)
      return {
        ...base,
        kind: 'move',
        target: itemTarget(content, op.section, op.itemId),
        before: index === -1 ? null : `Position ${index + 1}`,
        after: `Position ${to + 1}`,
      }
    }
    case 'set_section': {
      const index = sectionIndex(content, op)
      const section = content.sections[index]
      if (!section) {
        return { ...base, kind: 'section', target: 'Section', before: null, after: null }
      }
      const title = sectionName(content, section)
      const newTitle =
        op.title === null
          ? title
          : op.title || (section.key === 'custom' ? title : cvSectionTitles.fr[section.key])
      const describe = (visible: boolean, name: string, column: keyof typeof COLUMN_LABELS) =>
        `${name} (${visible ? 'visible' : 'masquée'}${column === 'auto' ? '' : `, ${COLUMN_LABELS[column]}`})`
      return {
        ...base,
        kind: 'section',
        target: `Section « ${title} »`,
        before: describe(section.visible, title, section.column),
        after: describe(op.visible ?? section.visible, newTitle, op.column ?? section.column),
      }
    }
    case 'move_section': {
      const index = sectionIndex(content, op)
      const to = clampIndex(op.toIndex, content.sections.length - 1)
      const section = content.sections[index]
      return {
        ...base,
        kind: 'move',
        target: section ? `Section « ${sectionName(content, section)} »` : 'Section',
        before: index === -1 ? null : `Position ${index + 1}`,
        after: `Position ${to + 1}`,
      }
    }
    case 'add_custom_section':
      return {
        ...base,
        kind: 'add',
        target: `Nouvelle section « ${op.title} »`,
        before: null,
        after: [op.title, ...op.items.map((item) => `• ${customDraftText(item)}`)].join('\n'),
      }
    case 'remove_custom_section': {
      const section = findCustom(content, op.customId)
      return {
        ...base,
        kind: 'remove',
        target: customTarget(content, op.customId),
        before: section
          ? [section.title, ...section.items.map((item) => `• ${customDraftText(item)}`)].join('\n')
          : null,
        after: null,
      }
    }
    case 'set_custom_item': {
      const item = findCustom(content, op.customId)?.items.find((entry) => entry.id === op.itemId)
      return {
        ...base,
        kind: 'edit',
        target: `${customTarget(content, op.customId, op.itemId)} · ${cvCustomItemFieldLabels[op.field]}`,
        before: item?.[op.field] ?? null,
        after: op.value,
      }
    }
    case 'add_custom_item':
      return {
        ...base,
        kind: 'add',
        target: `${customTarget(content, op.customId)} · nouvel élément`,
        before: null,
        after: customDraftText(op.item),
      }
    case 'remove_custom_item': {
      const item = findCustom(content, op.customId)?.items.find((entry) => entry.id === op.itemId)
      return {
        ...base,
        kind: 'remove',
        target: customTarget(content, op.customId, op.itemId),
        before: item ? customDraftText(item) : null,
        after: null,
      }
    }
    case 'move_custom_item': {
      const list = findCustom(content, op.customId)?.items ?? []
      const index = list.findIndex((item) => item.id === op.itemId)
      const to = clampIndex(op.toIndex, list.length - 1)
      return {
        ...base,
        kind: 'move',
        target: customTarget(content, op.customId, op.itemId),
        before: index === -1 ? null : `Position ${index + 1}`,
        after: `Position ${to + 1}`,
      }
    }
    case 'set_template':
    case 'set_design':
      // Described against the whole document by describeCvOperationInDocument.
      return { ...base, kind: 'design', target: 'Design', before: null, after: null }
  }
}
