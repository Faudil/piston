import type { CvHeaderField } from '@piston/shared'

/**
 * Content ids: names of the pieces of a CV the renderer reports boxes for
 * (`CvRenderResult.boxes`), so the editor can focus the field under a click
 * on the preview, and highlight the box of the field being edited.
 *
 * | id                     | what                                        |
 * | ---------------------- | ------------------------------------------- |
 * | `header.<field>`       | fullName, title, email, phone, city         |
 * | `header.contact`       | the whole contact line (when drawn as one)  |
 * | `header.link.<linkId>` | a link of the header                        |
 * | `header.photo`         | the photo                                   |
 * | `section.<ref>`        | a section title (`ref`: key or `custom:<id>`) |
 * | `summary`              | the summary paragraph                       |
 * | `item.<itemId>`        | an item of any section, custom ones included |
 * | `bullet.<bulletId>`    | a bullet                                    |
 * | `skill.<skillId>`      | one skill (styles that draw skills apart)   |
 *
 * Boxes nest: a bullet's box is inside its item's box. To find what was
 * clicked, take the smallest box containing the point.
 */
export const cvContentId = {
  header: (field: CvHeaderField) => `header.${field}`,
  contact: 'header.contact',
  link: (linkId: string) => `header.link.${linkId}`,
  photo: 'header.photo',
  /** `ref` is `cvSectionRef(section)`: the section key, or `custom:<customId>`. */
  section: (ref: string) => `section.${ref}`,
  summary: 'summary',
  item: (itemId: string) => `item.${itemId}`,
  bullet: (bulletId: string) => `bullet.${bulletId}`,
  skill: (skillId: string) => `skill.${skillId}`,
} as const

export type CvContentTarget =
  | { kind: 'header'; field: CvHeaderField | 'contact' | 'photo' }
  | { kind: 'link'; linkId: string }
  | { kind: 'section'; ref: string }
  | { kind: 'summary' }
  | { kind: 'item'; itemId: string }
  | { kind: 'bullet'; bulletId: string }
  | { kind: 'skill'; skillId: string }

/** What a content id points at, or null for an unknown id. */
export function parseCvContentId(id: string): CvContentTarget | null {
  if (id === 'summary') return { kind: 'summary' }
  if (id === cvContentId.contact) return { kind: 'header', field: 'contact' }
  if (id === cvContentId.photo) return { kind: 'header', field: 'photo' }
  const [prefix, ...rest] = id.split('.')
  const value = rest.join('.')
  if (!value) return null
  switch (prefix) {
    case 'header':
      if (value.startsWith('link.')) return { kind: 'link', linkId: value.slice(5) }
      if (['fullName', 'title', 'email', 'phone', 'city'].includes(value)) {
        return { kind: 'header', field: value as CvHeaderField }
      }
      return null
    case 'section':
      return { kind: 'section', ref: value }
    case 'item':
      return { kind: 'item', itemId: value }
    case 'bullet':
      return { kind: 'bullet', bulletId: value }
    case 'skill':
      return { kind: 'skill', skillId: value }
    default:
      return null
  }
}
