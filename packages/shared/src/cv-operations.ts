import * as z from 'zod'
import {
  CV_LIMITS,
  CV_SKILL_MAX_LEVEL,
  CvBulletSectionKey,
  CvCefr,
  CvHeaderField,
  CvListSectionKey,
  CvSectionColumn,
  CvSectionKey,
  createCvCustomItem,
  createCvCustomSection,
  createCvItem,
  cvCefrLabels,
  cvCustomFieldMaxLength,
  cvCustomItemFieldLabels,
  cvCustomItemFields,
  cvFieldLabels,
  cvFieldMaxLength,
  cvHeaderFieldLabels,
  cvItemLabel,
  cvItemTextFields,
  cvSectionMaxItems,
  cvSectionTitles,
  newCvId,
  normalizeSections,
  type CvBullet,
  type CvContent,
  type CvCustomSection,
  type CvItem,
  type CvSectionConfig,
  type CvSkill,
} from './cv'

/**
 * Edits that Claude proposes on a CV document, and the pure functions that
 * apply them.
 *
 * Claude never rewrites the document: it returns a list of typed operations
 * that target items and bullets by id. The user reviews each one (diff +
 * reason) and accepts or rejects it; the accepted ones are applied in the
 * browser with `applyCvOperations`. Ids rather than indexes make every
 * operation independent of the others, so any subset applies cleanly.
 *
 * The schema doubles as the structured-output format sent to Claude: field
 * descriptions are instructions. Lengths are checked when applying, not in
 * the schema (structured outputs ignore string constraints).
 */

const reason = z
  .string()
  .describe(
    'One short French sentence telling the user why this change helps, addressing them as "tu"',
  )
const itemId = z.string().describe('Id of an existing item, copied from the document')
const bulletId = z.string().describe('Id of an existing bullet, copied from the document')
const customId = z.string().describe('Id of an existing custom section, copied from the document')

/** Fields of an item to add. Only the fields of the item's section are kept. */
export const CvItemDraft = z
  .object({
    title: z.string().optional(),
    organization: z.string().optional(),
    location: z.string().optional(),
    start: z.string().optional().describe('MM/YYYY, YYYY, or empty if unknown'),
    end: z
      .string()
      .optional()
      .describe('MM/YYYY, YYYY, "Aujourd\'hui" for a current position, or empty'),
    degree: z.string().optional(),
    school: z.string().optional(),
    details: z.string().optional(),
    name: z.string().optional(),
    level: z.string().optional(),
    cefr: z.string().optional(),
    role: z.string().optional(),
    url: z.string().optional(),
    issuer: z.string().optional(),
    date: z.string().optional(),
    publisher: z.string().optional(),
    contact: z.string().optional(),
    text: z.string().optional(),
    bullets: z.array(z.string()).optional(),
    items: z.array(z.string()).optional(),
  })
  .describe(
    'Fields of the new item, by section: experiences and volunteering (title, organization, location, start, end, bullets); education (degree, school, location, start, end, details); skills (name, items); languages (name, level, cefr); projects (name, role, url, start, end, bullets); certifications (name, issuer, date, url); interests (name, details); awards (name, issuer, date, details); publications (title, publisher, date, url); references (name, role, organization, contact); extras (text)',
  )
export type CvItemDraft = z.infer<typeof CvItemDraft>

/** Fields of a custom section item to add. */
export const CvCustomItemDraft = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  date: z.string().optional(),
  text: z.string().optional(),
})
export type CvCustomItemDraft = z.infer<typeof CvCustomItemDraft>

export const SetHeaderOperation = z.object({
  op: z.literal('set_header'),
  field: CvHeaderField,
  value: z.string(),
  reason,
})
export const SetSummaryOperation = z.object({
  op: z.literal('set_summary'),
  value: z.string().describe('The new summary (accroche), 3 or 4 lines at most'),
  reason,
})
export const SetFieldOperation = z.object({
  op: z.literal('set_field'),
  section: CvListSectionKey,
  itemId,
  field: z
    .string()
    .describe('A text field of the item, e.g. "title" for an experience or "level" for a language'),
  value: z.string(),
  reason,
})
/** Replaces a group's skills; skills whose name is kept keep their level. */
export const SetSkillsOperation = z.object({
  op: z.literal('set_skills'),
  itemId: z.string().describe('Id of an existing skill group'),
  items: z.array(z.string()).describe('The complete new list of skills of the group'),
  reason,
})
export const SetSkillLevelOperation = z.object({
  op: z.literal('set_skill_level'),
  itemId: z.string().describe('Id of an existing skill group'),
  skillId: z.string().describe('Id of an existing skill of the group'),
  level: z.number().describe('0 (no level shown) to 5'),
  reason,
})
export const SetLanguageCefrOperation = z.object({
  op: z.literal('set_language_cefr'),
  itemId: z.string().describe('Id of an existing language'),
  cefr: CvCefr.nullable().describe('CEFR level, "natif" for a mother tongue, null for none'),
  reason,
})
export const SetBulletOperation = z.object({
  op: z.literal('set_bullet'),
  section: CvBulletSectionKey,
  itemId,
  bulletId,
  text: z.string().describe('The new text of the bullet'),
  reason,
})
export const AddBulletOperation = z.object({
  op: z.literal('add_bullet'),
  section: CvBulletSectionKey,
  itemId,
  afterBulletId: z
    .string()
    .nullable()
    .describe('Insert after this bullet; null to add it at the end'),
  text: z.string(),
  reason,
})
export const RemoveBulletOperation = z.object({
  op: z.literal('remove_bullet'),
  section: CvBulletSectionKey,
  itemId,
  bulletId,
  reason,
})
export const AddItemOperation = z.object({
  op: z.literal('add_item'),
  section: CvListSectionKey,
  position: z
    .number()
    .nullable()
    .describe('0-based index of the new item in its section; null to add it at the end'),
  item: CvItemDraft,
  reason,
})
export const RemoveItemOperation = z.object({
  op: z.literal('remove_item'),
  section: CvListSectionKey,
  itemId,
  reason,
})
export const MoveItemOperation = z.object({
  op: z.literal('move_item'),
  section: CvListSectionKey,
  itemId,
  toIndex: z.number().describe('0-based index of the item after the move'),
  reason,
})

/** A section entry: a built-in key, or `custom` with the custom section's id. */
const sectionTarget = {
  section: z.union([CvSectionKey, z.literal('custom')]),
  /** Required when `section` is `custom`; ignored otherwise. Optional for stored v1 proposals. */
  customId: z.string().nullish(),
}

export const SetSectionOperation = z.object({
  op: z.literal('set_section'),
  ...sectionTarget,
  visible: z.boolean().nullable().describe('Show or hide the section; null to leave it unchanged'),
  title: z
    .string()
    .nullable()
    .describe('Custom title; empty string for the default title; null to leave it unchanged'),
  column: CvSectionColumn.nullish().describe(
    'Column in two-column templates (auto, main or side); null to leave it unchanged',
  ),
  reason,
})
export const MoveSectionOperation = z.object({
  op: z.literal('move_section'),
  ...sectionTarget,
  toIndex: z.number().describe('0-based index of the section after the move'),
  reason,
})
export const AddCustomSectionOperation = z.object({
  op: z.literal('add_custom_section'),
  title: z.string(),
  position: z
    .number()
    .nullable()
    .describe('0-based index of the new section among all sections; null for the end'),
  items: z.array(CvCustomItemDraft),
  reason,
})
export const RemoveCustomSectionOperation = z.object({
  op: z.literal('remove_custom_section'),
  customId,
  reason,
})
export const SetCustomItemOperation = z.object({
  op: z.literal('set_custom_item'),
  customId,
  itemId,
  field: z.enum(cvCustomItemFields),
  value: z.string(),
  reason,
})
export const AddCustomItemOperation = z.object({
  op: z.literal('add_custom_item'),
  customId,
  position: z.number().nullable(),
  item: CvCustomItemDraft,
  reason,
})
export const RemoveCustomItemOperation = z.object({
  op: z.literal('remove_custom_item'),
  customId,
  itemId,
  reason,
})
export const MoveCustomItemOperation = z.object({
  op: z.literal('move_custom_item'),
  customId,
  itemId,
  toIndex: z.number(),
  reason,
})

export const CvOperation = z.discriminatedUnion('op', [
  SetHeaderOperation,
  SetSummaryOperation,
  SetFieldOperation,
  SetSkillsOperation,
  SetSkillLevelOperation,
  SetLanguageCefrOperation,
  SetBulletOperation,
  AddBulletOperation,
  RemoveBulletOperation,
  AddItemOperation,
  RemoveItemOperation,
  MoveItemOperation,
  SetSectionOperation,
  MoveSectionOperation,
  AddCustomSectionOperation,
  RemoveCustomSectionOperation,
  SetCustomItemOperation,
  AddCustomItemOperation,
  RemoveCustomItemOperation,
  MoveCustomItemOperation,
])
export type CvOperation = z.infer<typeof CvOperation>
export type CvOperationKind = CvOperation['op']

export const cvOperationKinds = [
  'set_header',
  'set_summary',
  'set_field',
  'set_skills',
  'set_skill_level',
  'set_language_cefr',
  'set_bullet',
  'add_bullet',
  'remove_bullet',
  'add_item',
  'remove_item',
  'move_item',
  'set_section',
  'move_section',
  'add_custom_section',
  'remove_custom_section',
  'set_custom_item',
  'add_custom_item',
  'remove_custom_item',
  'move_custom_item',
] as const satisfies readonly CvOperationKind[]

/**
 * The operation as Claude writes it: one flat object whose fields are all
 * present (null when unused), converted to a `CvOperation` by `fromWire`.
 *
 * Why not send the `CvOperation` union itself: structured outputs compile the
 * schema into a grammar, and a union of twenty objects (one of them with
 * twenty optional fields) exceeds the API's grammar size limit ("The compiled
 * grammar is too large"). One object with nullable fields compiles small, and
 * the typed union stays the model used everywhere else.
 */
export const CvOperationWire = z.object({
  op: z.enum(cvOperationKinds).describe('The kind of edit'),
  section: z
    .string()
    .nullable()
    .describe(
      'Section key: summary, experiences, education, skills, languages, projects, certifications, interests, volunteering, awards, publications, references, extras, or "custom" for a custom section (then set customId); null for operations without a section',
    ),
  customId: z
    .string()
    .nullable()
    .describe(
      'Id of an existing custom section, copied from the document: set_section and move_section with section "custom", remove_custom_section and the *_custom_item operations; null otherwise',
    ),
  itemId: z
    .string()
    .nullable()
    .describe('Id of an existing item, copied from the document; null if none'),
  bulletId: z
    .string()
    .nullable()
    .describe(
      'set_bullet, remove_bullet: id of an existing bullet. add_bullet: insert after this bullet, null to add at the end. set_skill_level: id of the skill inside the group',
    ),
  field: z
    .string()
    .nullable()
    .describe(
      'set_header: fullName, title, email, phone or city. set_field: a text field of the item (e.g. title, organization, location, start, end, degree, school, details, name, level, role, url, issuer, date, publisher, contact, text). set_custom_item: title, subtitle, date or text',
    ),
  value: z
    .string()
    .nullable()
    .describe(
      'The new text for set_header, set_summary, set_field, set_bullet, add_bullet and set_custom_item. set_section: custom title, empty string for the default title, null to leave it unchanged. add_custom_section: the title of the new section. set_language_cefr: A1, A2, B1, B2, C1, C2, natif, or null',
    ),
  list: z
    .array(z.string())
    .nullable()
    .describe(
      'set_skills: the complete new list of the group. add_item: the bullets of a new experience, volunteering or project, or the skills of a new skill group. add_custom_section: the titles of its first items',
    ),
  fields: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .nullable()
    .describe(
      'add_item and add_custom_item: the text fields of the new item. experiences, volunteering: title, organization, location, start, end; education: degree, school, location, start, end, details; skills: name; languages: name, level, cefr; projects: name, role, url, start, end; certifications: name, issuer, date, url; interests: name, details; awards: name, issuer, date, details; publications: title, publisher, date, url; references: name, role, organization, contact; extras: text; custom items: title, subtitle, date, text',
    ),
  index: z
    .number()
    .nullable()
    .describe(
      'add_item, add_custom_item, add_custom_section: 0-based position of the new element, null for the end. move_item, move_custom_item, move_section: 0-based position after the move',
    ),
  level: z.number().nullable().describe('set_skill_level: 0 (no level) to 5; null otherwise'),
  visible: z
    .boolean()
    .nullable()
    .describe('set_section: true to show, false to hide, null to leave unchanged'),
  column: z
    .string()
    .nullable()
    .describe(
      'set_section: column in two-column templates, "main", "side" or "auto" (template default); null to leave unchanged',
    ),
  reason,
})
export type CvOperationWire = z.infer<typeof CvOperationWire>

/** The schema sent to Claude for every CV edit request (kind `cv_edit`). */
export const CvEditOutput = z.object({
  summary: z
    .string()
    .describe(
      'One or two French sentences summarizing the proposed changes, addressing the user as "tu"',
    ),
  operations: z
    .array(CvOperationWire)
    .describe(
      'The proposed edits, in the order they should be shown; empty if nothing should change',
    ),
})
export type CvEditOutput = z.infer<typeof CvEditOutput>

/** The stored output of a `cv_edit` generation: the valid, typed operations, and how many were dropped. */
export interface CvEditProposal {
  summary: string
  operations: CvOperation[]
  dropped: number
}

/** Converts Claude's flat operation into the typed one; the caller validates it. */
export function fromWire(wire: CvOperationWire): Record<string, unknown> {
  const { op, section, itemId, bulletId, field, value, list, fields, index, visible, reason } = wire
  // Older stored or streamed answers may lack the v2 fields entirely.
  const customId = wire.customId ?? null
  const draft = () =>
    Object.fromEntries((fields ?? []).map((entry) => [entry.name, entry.value])) as Record<
      string,
      unknown
    >
  switch (op) {
    case 'set_header':
      return { op, field, value, reason }
    case 'set_summary':
      return { op, value, reason }
    case 'set_field':
      return { op, section, itemId, field, value, reason }
    case 'set_skills':
      return { op, itemId, items: list, reason }
    case 'set_skill_level':
      return { op, itemId, skillId: bulletId, level: wire.level ?? null, reason }
    case 'set_language_cefr':
      return { op, itemId, cefr: value === '' ? null : value, reason }
    case 'set_bullet':
      return { op, section, itemId, bulletId, text: value, reason }
    case 'add_bullet':
      return { op, section, itemId, afterBulletId: bulletId, text: value, reason }
    case 'remove_bullet':
      return { op, section, itemId, bulletId, reason }
    case 'add_item': {
      const item = draft()
      if (list) item[section === 'skills' ? 'items' : 'bullets'] = list
      return { op, section, position: index, item, reason }
    }
    case 'remove_item':
      return { op, section, itemId, reason }
    case 'move_item':
      return { op, section, itemId, toIndex: index, reason }
    case 'set_section':
      return { op, section, customId, visible, title: value, column: wire.column ?? null, reason }
    case 'move_section':
      return { op, section, customId, toIndex: index, reason }
    case 'add_custom_section':
      return {
        op,
        title: value,
        position: index,
        items: (list ?? []).map((title) => ({ title })),
        reason,
      }
    case 'remove_custom_section':
      return { op, customId, reason }
    case 'set_custom_item':
      return { op, customId, itemId, field, value, reason }
    case 'add_custom_item':
      return { op, customId, position: index, item: draft(), reason }
    case 'remove_custom_item':
      return { op, customId, itemId, reason }
    case 'move_custom_item':
      return { op, customId, itemId, toIndex: index, reason }
  }
}

/** The wire shape with the v2 fields optional, for answers stored or streamed before they existed. */
const LenientWire = CvOperationWire.extend({
  customId: z.string().nullable().default(null),
  level: z.number().nullable().default(null),
  column: z.string().nullable().default(null),
})

/**
 * Lenient parse of Claude's answer: every operation is converted and
 * validated on its own, and invalid ones are dropped (and counted) instead of
 * failing the whole proposal. Returns null when the answer is not a proposal.
 */
export function parseCvEditOutput(value: unknown): CvEditProposal | null {
  const shape = z
    .object({ summary: z.string().catch(''), operations: z.array(z.unknown()) })
    .safeParse(value)
  if (!shape.success) return null
  const operations: CvOperation[] = []
  for (const raw of shape.data.operations) {
    const wire = LenientWire.safeParse(raw)
    const parsed = wire.success ? CvOperation.safeParse(fromWire(wire.data)) : wire
    if (parsed.success) operations.push(parsed.data as CvOperation)
  }
  return {
    summary: shape.data.summary,
    operations,
    dropped: shape.data.operations.length - operations.length,
  }
}

// --- Application ----------------------------------------------------------------

export type CvApplyResult = { ok: true; content: CvContent } | { ok: false; reason: string }

const fail = (reason: string): CvApplyResult => ({ ok: false, reason })
const tooLong = (max: number) => fail(`Texte trop long (${max} caractères au maximum).`)
const clampIndex = (index: number, length: number) =>
  Math.min(Math.max(0, Math.round(index)), Math.max(0, length))

function findItem(content: CvContent, section: CvListSectionKey, id: string): CvItem | undefined {
  return (content[section] as CvItem[]).find((item) => item.id === id)
}

function bulletsOf(content: CvContent, section: CvBulletSectionKey, id: string) {
  return content[section].find((item) => item.id === id)?.bullets
}

function findCustom(content: CvContent, id: string | null | undefined) {
  return id ? content.custom.find((section) => section.id === id) : undefined
}

/** Index of a section entry in `content.sections`, -1 if it does not exist. */
function sectionIndex(
  content: CvContent,
  target: { section: CvSectionConfig['key']; customId?: string | null },
): number {
  return content.sections.findIndex((entry) =>
    target.section === 'custom'
      ? entry.key === 'custom' && entry.customId === target.customId
      : entry.key === target.section,
  )
}

/** A fresh id that does not collide with the given list's ids. */
function uniqueId(list: Array<{ id: string }>): string {
  const taken = new Set(list.map((entry) => entry.id))
  let id = newCvId()
  while (taken.has(id)) id = newCvId()
  return id
}

/** Checks the fields of a custom item draft against their limits; null when they fit. */
function customDraftProblem(draft: CvCustomItemDraft): CvApplyResult | null {
  for (const field of cvCustomItemFields) {
    const value = draft[field]
    if (typeof value === 'string' && value.length > cvCustomFieldMaxLength(field)) {
      return tooLong(cvCustomFieldMaxLength(field))
    }
  }
  return null
}

const customDraftFilled = (draft: CvCustomItemDraft) =>
  cvCustomItemFields.some((field) => draft[field]?.trim())

const SECTION_GONE = 'Section introuvable : elle a peut-être été supprimée.'

/**
 * Applies one operation to a copy of the document. Never throws: an
 * operation that cannot apply (unknown id, limit reached, field that the
 * item does not have...) returns a French reason instead.
 */
export function applyCvOperation(content: CvContent, op: CvOperation): CvApplyResult {
  // A JSON copy rather than structuredClone, which throws on the reactive
  // proxies the editor passes in (the document is plain JSON anyway).
  const next = JSON.parse(JSON.stringify(content)) as CvContent

  switch (op.op) {
    case 'set_header': {
      const max =
        op.field === 'phone'
          ? CV_LIMITS.phone
          : op.field === 'city'
            ? CV_LIMITS.location
            : CV_LIMITS.shortText
      if (op.value.length > max) return tooLong(max)
      next.header[op.field] = op.value
      return { ok: true, content: next }
    }

    case 'set_summary': {
      if (op.value.length > CV_LIMITS.summary) return tooLong(CV_LIMITS.summary)
      next.summary = op.value
      return { ok: true, content: next }
    }

    case 'set_field': {
      const item = findItem(next, op.section, op.itemId)
      if (!item) return fail('Élément introuvable : il a peut-être été supprimé.')
      if (!(cvItemTextFields[op.section] as readonly string[]).includes(op.field)) {
        return fail('Ce champ n’existe pas pour cet élément.')
      }
      const max = cvFieldMaxLength(op.field)
      if (op.value.length > max) return tooLong(max)
      ;(item as unknown as Record<string, string>)[op.field] = op.value
      return { ok: true, content: next }
    }

    case 'set_skills': {
      const group = next.skills.find((entry) => entry.id === op.itemId)
      if (!group) return fail('Groupe de compétences introuvable.')
      const names = op.items.map((entry) => entry.trim()).filter(Boolean)
      if (names.length > CV_LIMITS.skillItems) {
        return fail(`Trop de compétences (${CV_LIMITS.skillItems} au maximum par groupe).`)
      }
      if (names.some((entry) => entry.length > CV_LIMITS.skillItem))
        return tooLong(CV_LIMITS.skillItem)
      // A skill whose name is kept keeps its id and level, even if it moved.
      const previous = new Map(group.items.map((skill) => [skill.name.trim().toLowerCase(), skill]))
      const items: CvSkill[] = []
      for (const name of names) {
        const kept = previous.get(name.toLowerCase())
        if (kept) previous.delete(name.toLowerCase())
        items.push(
          kept ? { ...kept, name } : { id: uniqueId([...group.items, ...items]), name, level: 0 },
        )
      }
      group.items = items
      return { ok: true, content: next }
    }

    case 'set_skill_level': {
      const group = next.skills.find((entry) => entry.id === op.itemId)
      const skill = group?.items.find((entry) => entry.id === op.skillId)
      if (!skill) return fail('Compétence introuvable : elle a peut-être été supprimée.')
      if (!Number.isInteger(op.level) || op.level < 0 || op.level > CV_SKILL_MAX_LEVEL) {
        return fail(`Le niveau va de 0 (aucun) à ${CV_SKILL_MAX_LEVEL}.`)
      }
      skill.level = op.level
      return { ok: true, content: next }
    }

    case 'set_language_cefr': {
      const language = next.languages.find((entry) => entry.id === op.itemId)
      if (!language) return fail('Langue introuvable : elle a peut-être été supprimée.')
      language.cefr = op.cefr
      return { ok: true, content: next }
    }

    case 'set_bullet': {
      const bullet = bulletsOf(next, op.section, op.itemId)?.find(
        (entry) => entry.id === op.bulletId,
      )
      if (!bullet) return fail('Puce introuvable : elle a peut-être été supprimée.')
      if (!op.text.trim()) return fail('Le nouveau texte est vide.')
      if (op.text.length > CV_LIMITS.bullet) return tooLong(CV_LIMITS.bullet)
      bullet.text = op.text
      return { ok: true, content: next }
    }

    case 'add_bullet': {
      const list = bulletsOf(next, op.section, op.itemId)
      if (!list) return fail('Élément introuvable : il a peut-être été supprimé.')
      if (list.length >= CV_LIMITS.bullets)
        return fail(`${CV_LIMITS.bullets} puces au maximum par élément.`)
      if (!op.text.trim()) return fail('Le texte de la puce est vide.')
      if (op.text.length > CV_LIMITS.bullet) return tooLong(CV_LIMITS.bullet)
      // An unknown reference only changes where the bullet goes: it is added at the end.
      const after =
        op.afterBulletId === null ? -1 : list.findIndex((entry) => entry.id === op.afterBulletId)
      const bullet: CvBullet = { id: uniqueId(list), text: op.text }
      list.splice(after === -1 ? list.length : after + 1, 0, bullet)
      return { ok: true, content: next }
    }

    case 'remove_bullet': {
      const list = bulletsOf(next, op.section, op.itemId)
      const index = list?.findIndex((entry) => entry.id === op.bulletId) ?? -1
      if (!list || index === -1)
        return fail('Puce introuvable : elle a peut-être déjà été supprimée.')
      list.splice(index, 1)
      return { ok: true, content: next }
    }

    case 'add_item': {
      const list = next[op.section] as CvItem[]
      const max = cvSectionMaxItems[op.section]
      if (list.length >= max) return fail(`${max} éléments au maximum dans cette section.`)
      const draft = op.item as Record<string, unknown>
      const fields = cvItemTextFields[op.section] as readonly string[]
      for (const field of fields) {
        const value = draft[field]
        if (typeof value === 'string' && value.length > cvFieldMaxLength(field)) {
          return tooLong(cvFieldMaxLength(field))
        }
      }
      const item = createCvItem(op.section, draft)
      const filled = fields.some((field) =>
        String((item as unknown as Record<string, string>)[field]).trim(),
      )
      if (!filled) return fail('Le nouvel élément est vide.')
      const position = op.position === null ? list.length : clampIndex(op.position, list.length)
      list.splice(position, 0, item)
      return { ok: true, content: next }
    }

    case 'remove_item': {
      const list = next[op.section] as CvItem[]
      const index = list.findIndex((item) => item.id === op.itemId)
      if (index === -1) return fail('Élément introuvable : il a peut-être déjà été supprimé.')
      list.splice(index, 1)
      return { ok: true, content: next }
    }

    case 'move_item': {
      const list = next[op.section] as CvItem[]
      const index = list.findIndex((item) => item.id === op.itemId)
      if (index === -1) return fail('Élément introuvable : il a peut-être été supprimé.')
      const [item] = list.splice(index, 1)
      list.splice(clampIndex(op.toIndex, list.length), 0, item!)
      return { ok: true, content: next }
    }

    case 'set_section': {
      const index = sectionIndex(next, op)
      if (index === -1) return fail(SECTION_GONE)
      const section = next.sections[index]!
      if (op.title !== null && op.title.length > CV_LIMITS.sectionTitle)
        return tooLong(CV_LIMITS.sectionTitle)
      if (op.visible !== null) section.visible = op.visible
      if (op.column != null) section.column = op.column
      if (op.title !== null) {
        if (section.key === 'custom') {
          // A custom section's title lives in `content.custom`, and is never empty.
          if (!op.title.trim()) return fail('Le titre de la section est vide.')
          findCustom(next, section.customId)!.title = op.title
        } else {
          section.title = op.title
        }
      }
      return { ok: true, content: next }
    }

    case 'move_section': {
      const index = sectionIndex(next, op)
      if (index === -1) return fail(SECTION_GONE)
      const [section] = next.sections.splice(index, 1)
      next.sections.splice(clampIndex(op.toIndex, next.sections.length), 0, section!)
      return { ok: true, content: next }
    }

    case 'add_custom_section': {
      if (next.custom.length >= CV_LIMITS.customSections) {
        return fail(`${CV_LIMITS.customSections} sections personnalisées au maximum.`)
      }
      if (!op.title.trim()) return fail('Le titre de la section est vide.')
      if (op.title.length > CV_LIMITS.sectionTitle) return tooLong(CV_LIMITS.sectionTitle)
      if (op.items.length > CV_LIMITS.customItems) {
        return fail(`${CV_LIMITS.customItems} éléments au maximum dans cette section.`)
      }
      for (const item of op.items) {
        const problem = customDraftProblem(item)
        if (problem) return problem
      }
      const section: CvCustomSection = createCvCustomSection(
        op.title,
        op.items.filter(customDraftFilled),
      )
      while (next.custom.some((entry) => entry.id === section.id)) section.id = newCvId()
      next.custom.push(section)
      const entry: CvSectionConfig = {
        key: 'custom',
        customId: section.id,
        title: '',
        visible: true,
        column: 'auto',
      }
      const position =
        op.position === null ? next.sections.length : clampIndex(op.position, next.sections.length)
      next.sections.splice(position, 0, entry)
      return { ok: true, content: next }
    }

    case 'remove_custom_section': {
      const index = next.custom.findIndex((entry) => entry.id === op.customId)
      if (index === -1) return fail('Section introuvable : elle a peut-être déjà été supprimée.')
      next.custom.splice(index, 1)
      next.sections = normalizeSections(
        next.sections,
        next.custom.map((entry) => entry.id),
      )
      return { ok: true, content: next }
    }

    case 'set_custom_item': {
      const item = findCustom(next, op.customId)?.items.find((entry) => entry.id === op.itemId)
      if (!item) return fail('Élément introuvable : il a peut-être été supprimé.')
      const max = cvCustomFieldMaxLength(op.field)
      if (op.value.length > max) return tooLong(max)
      item[op.field] = op.value
      return { ok: true, content: next }
    }

    case 'add_custom_item': {
      const section = findCustom(next, op.customId)
      if (!section) return fail(SECTION_GONE)
      if (section.items.length >= CV_LIMITS.customItems) {
        return fail(`${CV_LIMITS.customItems} éléments au maximum dans cette section.`)
      }
      const problem = customDraftProblem(op.item)
      if (problem) return problem
      if (!customDraftFilled(op.item)) return fail('Le nouvel élément est vide.')
      const item = createCvCustomItem(op.item)
      item.id = uniqueId(section.items)
      const position =
        op.position === null ? section.items.length : clampIndex(op.position, section.items.length)
      section.items.splice(position, 0, item)
      return { ok: true, content: next }
    }

    case 'remove_custom_item': {
      const list = findCustom(next, op.customId)?.items
      const index = list?.findIndex((entry) => entry.id === op.itemId) ?? -1
      if (!list || index === -1)
        return fail('Élément introuvable : il a peut-être déjà été supprimé.')
      list.splice(index, 1)
      return { ok: true, content: next }
    }

    case 'move_custom_item': {
      const list = findCustom(next, op.customId)?.items
      const index = list?.findIndex((entry) => entry.id === op.itemId) ?? -1
      if (!list || index === -1) return fail('Élément introuvable : il a peut-être été supprimé.')
      const [item] = list.splice(index, 1)
      list.splice(clampIndex(op.toIndex, list.length), 0, item!)
      return { ok: true, content: next }
    }
  }
}

export interface CvOperationResult {
  index: number
  ok: boolean
  /** Why the operation could not apply, when `ok` is false. */
  reason?: string
}

/**
 * Applies operations in order, skipping (and reporting) those that cannot
 * apply, e.g. a bullet edit whose item was removed by an earlier operation.
 */
export function applyCvOperations(
  content: CvContent,
  operations: CvOperation[],
): { content: CvContent; results: CvOperationResult[] } {
  let current = content
  const results: CvOperationResult[] = []
  operations.forEach((op, index) => {
    const result = applyCvOperation(current, op)
    if (result.ok) {
      current = result.content
      results.push({ index, ok: true })
    } else {
      results.push({ index, ok: false, reason: result.reason })
    }
  })
  return { content: current, results }
}

// --- Description (proposal review UI) ----------------------------------------------

export type CvChangeKind = 'edit' | 'add' | 'remove' | 'move' | 'section'

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
  }
}

// --- Word diff ------------------------------------------------------------------------

export interface DiffPart {
  type: 'same' | 'added' | 'removed'
  text: string
}

/**
 * Word-level diff (longest common subsequence on words), to
 * highlight what an edit changes. Falls back to "all removed, all added"
 * beyond 400 tokens per side, which keeps it instant on any CV text.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  // Tokens are words (or single punctuation marks) with their trailing
  // whitespace: spaces do not match on their own, and « municipal » still
  // matches when a comma is added after it.
  const tokenize = (value: string) =>
    value.match(/[\p{L}\p{N}'’[\]%€-]+\s*|[^\s\p{L}\p{N}'’[\]%€-]\s*|\s+/gu) ?? []
  const a = tokenize(before)
  const b = tokenize(after)
  if (a.length > 400 || b.length > 400) {
    return [
      ...(before ? [{ type: 'removed' as const, text: before }] : []),
      ...(after ? [{ type: 'added' as const, text: after }] : []),
    ]
  }
  // lengths[i][j] = LCS length of a[i:] and b[j:]
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i]![j] =
        a[i] === b[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!)
    }
  }
  const parts: DiffPart[] = []
  const push = (type: DiffPart['type'], text: string) => {
    const last = parts.at(-1)
    if (last?.type === type) last.text += text
    else parts.push({ type, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i]!)
      i++
      j++
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      push('removed', a[i++]!)
    } else {
      push('added', b[j++]!)
    }
  }
  while (i < a.length) push('removed', a[i++]!)
  while (j < b.length) push('added', b[j++]!)
  return parts
}
