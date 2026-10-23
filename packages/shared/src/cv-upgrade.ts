import { CvContent } from './cv'
import { CvDesign } from './cv-design'

/**
 * Upgrades a stored CV document (its `content` and `design` jsonb columns,
 * or a revision's) to the current schemas: v1 documents become v2 (see
 * `upgradeCvContent` and `upgradeCvDesign`), v2 documents are validated and
 * returned with their defaults filled. Pure and idempotent.
 *
 * The database keeps the stored JSON as is: a document is rewritten as v2 on
 * its next save, never by a migration.
 */
export function upgradeCvDocument(stored: { content: unknown; design: unknown }): {
  content: CvContent
  design: CvDesign
} {
  return { content: CvContent.parse(stored.content), design: CvDesign.parse(stored.design) }
}
