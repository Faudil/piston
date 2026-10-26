import * as z from 'zod'
import {
  CvBulletSectionKey,
  CvCefr,
  CvHeaderField,
  CvListSectionKey,
  CvSectionColumn,
  CvSectionKey,
  cvCustomItemFields,
} from './cv'
import {
  CV_FONT_SIZE_STEPS,
  CvBulletStyle,
  CvColor,
  CvFontPairingId,
  CvHeaderStyle,
  CvItemStyle,
  CvLanguageStyle,
  CvLayout,
  CvLineHeight,
  CvMargins,
  CvSectionTitleStyle,
  CvSkillStyle,
  CvSpacing,
} from './cv-design'
import { CvTemplateId } from './cv-templates'

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

// --- Design operations -------------------------------------------------------------------

/**
 * The design settings Claude may change (a subset of the design overrides:
 * not the body text color, the page format or the language). `null` removes
 * the override, so the template's value applies again.
 */
export const cvDesignChangeKeys = [
  'primary',
  'secondary',
  'sidebarBg',
  'fontPairing',
  'layout',
  'headerStyle',
  'sectionTitleStyle',
  'itemStyle',
  'bulletStyle',
  'skillStyle',
  'languageStyle',
  'spacing',
  'lineHeight',
  'margins',
  'fontSize',
  'showIcons',
] as const
export type CvDesignChangeKey = (typeof cvDesignChangeKeys)[number]

export const CvDesignChanges = z
  .strictObject({
    primary: CvColor.nullable(),
    secondary: CvColor.nullable(),
    sidebarBg: CvColor.nullable(),
    fontPairing: CvFontPairingId.nullable(),
    layout: CvLayout.nullable(),
    headerStyle: CvHeaderStyle.nullable(),
    sectionTitleStyle: CvSectionTitleStyle.nullable(),
    itemStyle: CvItemStyle.nullable(),
    bulletStyle: CvBulletStyle.nullable(),
    skillStyle: CvSkillStyle.nullable(),
    languageStyle: CvLanguageStyle.nullable(),
    spacing: CvSpacing.nullable(),
    lineHeight: CvLineHeight.nullable(),
    margins: CvMargins.nullable(),
    fontSize: z.number().int().min(CV_FONT_SIZE_STEPS.min).max(CV_FONT_SIZE_STEPS.max).nullable(),
    showIcons: z.boolean().nullable(),
  })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, 'Aucun réglage.')
export type CvDesignChanges = z.infer<typeof CvDesignChanges>

export const SetTemplateOperation = z.object({
  op: z.literal('set_template'),
  templateId: CvTemplateId,
  resetDesign: z
    .boolean()
    .describe("Also remove the user's design customizations (colors, fonts, styles)"),
  reason,
})
export const SetDesignOperation = z.object({
  op: z.literal('set_design'),
  changes: CvDesignChanges,
  reason,
})

export type CvDesignOperation = z.infer<typeof SetTemplateOperation | typeof SetDesignOperation>
/** Design operations change the document's design, not its content. */
export function isCvDesignOperation(op: { op: string }): op is CvDesignOperation {
  return op.op === 'set_template' || op.op === 'set_design'
}

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
  SetTemplateOperation,
  SetDesignOperation,
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
  'set_template',
  'set_design',
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
      'The new text for set_header, set_summary, set_field, set_bullet, add_bullet and set_custom_item. set_section: custom title, empty string for the default title, null to leave it unchanged. add_custom_section: the title of the new section. set_language_cefr: A1, A2, B1, B2, C1, C2, natif, or null. set_template: the template id',
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
      'add_item and add_custom_item: the text fields of the new item. experiences, volunteering: title, organization, location, start, end; education: degree, school, location, start, end, details; skills: name; languages: name, level, cefr; projects: name, role, url, start, end; certifications: name, issuer, date, url; interests: name, details; awards: name, issuer, date, details; publications: title, publisher, date, url; references: name, role, organization, contact; extras: text; custom items: title, subtitle, date, text. set_design: the settings to change, by name (primary, secondary, sidebarBg: #rrggbb colors; fontPairing, layout, headerStyle, sectionTitleStyle, itemStyle, bulletStyle, skillStyle, languageStyle, spacing, lineHeight, margins: ids from the design catalog; fontSize: -2 to 2; showIcons: true or false); a value of "default" returns the setting to the template\'s value',
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
    .describe(
      'set_section: true to show, false to hide, null to leave unchanged. set_template: true to also reset the design customizations, false to keep them',
    ),
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
  /**
   * « Compléter cette section », first step: questions for the user instead
   * of operations. The answers come back in a second request.
   */
  questions?: CvQuestion[]
}

export interface CvQuestion {
  question: string
  /** An example of a good answer, shown under the field. */
  hint: string
}

/** The schema of the questions step of « Compléter cette section » (kind `cv_edit`, no operations). */
export const CvQuestionsOutput = z.object({
  summary: z
    .string()
    .describe(
      'One French sentence telling the user what is missing in the section and why you ask, addressing them as "tu"',
    ),
  questions: z
    .array(
      z.object({
        question: z.string().describe('A short French question about a fact only the user knows'),
        hint: z
          .string()
          .describe('A short French example of a good answer, with made-up-free wording'),
      }),
    )
    .describe('2 or 3 questions, the most useful first'),
})

/** Lenient parse of the questions step: at most 3 non-empty questions, null if none. */
export function parseCvQuestionsOutput(value: unknown): CvEditProposal | null {
  const parsed = CvQuestionsOutput.safeParse(value)
  if (!parsed.success) return null
  const questions = parsed.data.questions
    .map((entry) => ({ question: entry.question.trim(), hint: entry.hint.trim() }))
    .filter((entry) => entry.question)
    .slice(0, 3)
  if (!questions.length) return null
  return { summary: parsed.data.summary, operations: [], dropped: 0, questions }
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
    case 'set_template':
      return { op, templateId: value, resetDesign: visible === true, reason }
    case 'set_design':
      return { op, changes: designChangesFromWire(fields), reason }
  }
}

/** The `set_design` fields as a changes object; "default" or an empty value clears a setting. */
function designChangesFromWire(fields: CvOperationWire['fields']): Record<string, unknown> {
  const changes: Record<string, unknown> = {}
  for (const { name, value } of fields ?? []) {
    const text = value.trim()
    if (text === '' || text.toLowerCase() === 'default') changes[name] = null
    else if (name === 'fontSize') changes[name] = Number(text)
    else if (name === 'showIcons')
      changes[name] = text === 'true' ? true : text === 'false' ? false : text
    else changes[name] = text.toLowerCase()
  }
  return changes
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
