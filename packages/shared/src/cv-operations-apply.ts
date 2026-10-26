import {
  type CvBulletSectionKey,
  type CvListSectionKey,
  CV_LIMITS,
  CV_SKILL_MAX_LEVEL,
  createCvCustomItem,
  createCvCustomSection,
  createCvItem,
  cvCustomFieldMaxLength,
  cvCustomItemFields,
  cvFieldMaxLength,
  cvItemTextFields,
  cvSectionMaxItems,
  newCvId,
  normalizeSections,
  type CvBullet,
  type CvContent,
  type CvCustomSection,
  type CvItem,
  type CvSectionConfig,
  type CvSkill,
} from './cv'
import type { CvCustomItemDraft, CvOperation } from './cv-operations-schema'

// --- Application ----------------------------------------------------------------

export type CvApplyResult = { ok: true; content: CvContent } | { ok: false; reason: string }

const fail = (reason: string): CvApplyResult => ({ ok: false, reason })
const tooLong = (max: number) => fail(`Texte trop long (${max} caractères au maximum).`)
export const clampIndex = (index: number, length: number) =>
  Math.min(Math.max(0, Math.round(index)), Math.max(0, length))

export function findItem(
  content: CvContent,
  section: CvListSectionKey,
  id: string,
): CvItem | undefined {
  return (content[section] as CvItem[]).find((item) => item.id === id)
}

export function bulletsOf(content: CvContent, section: CvBulletSectionKey, id: string) {
  return content[section].find((item) => item.id === id)?.bullets
}

export function findCustom(content: CvContent, id: string | null | undefined) {
  return id ? content.custom.find((section) => section.id === id) : undefined
}

/** Index of a section entry in `content.sections`, -1 if it does not exist. */
export function sectionIndex(
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

    // Design operations need the whole document: see cv-document-operations.ts.
    case 'set_template':
    case 'set_design':
      return fail('Cette modification concerne le design du CV, pas son contenu.')
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
