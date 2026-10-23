import type { CvContentBox } from '../types'

/**
 * Content boxes for click-to-edit.
 *
 * pdfmake 0.3 has no public layout result, but it lays out the very node
 * objects of the document definition and records on each one the position
 * of every line it drew (`node.positions`: page, left, top). The renderer
 * tags the nodes worth locating with a `cvBox` property (ignored by
 * pdfmake), and after `createPdf(...).getBuffer()` `collectBoxes` walks the
 * definition and turns each tagged node's positions into rectangles.
 *
 * Positions give the left edge and the top of each line, not the width nor
 * the height of the last line: the tag carries the right edge of the region
 * the node was laid out in (its column) and the height of its last line.
 * Good enough to find what was clicked; not a pixel-exact outline.
 */

/** Horizontal extent of the column a node is laid out in, in page coordinates. */
export interface Region {
  left: number
  right: number
  /** True for a narrow side column (sidebar layouts): items stack instead of using columns. */
  side: boolean
}

export interface BoxTag {
  id: string
  /** Right edge of the node's column. */
  right: number
  /** Height of the node's last line, in points. */
  lastLine: number
  /** Short text: the box is as wide as the text, not as the column. */
  fit: boolean
}

interface Position {
  pageNumber: number
  left: number
  top: number
}

interface LaidOutNode {
  cvBox?: BoxTag
  positions?: Position[]
  _maxWidth?: number
}

/** Tags a definition node so that `collectBoxes` reports its box. Returns the node. */
export function tagBox<T>(
  node: T,
  id: string,
  region: Region,
  options: { lastLine: number; fit?: boolean },
): T {
  const tag: BoxTag = {
    id,
    right: region.right,
    lastLine: options.lastLine,
    fit: options.fit ?? false,
  }
  // Strings (bare text nodes) cannot carry a tag; every tagged block is an object.
  if (node && typeof node === 'object') Object.assign(node, { cvBox: tag })
  return node
}

/** The keys under which pdfmake nodes nest other nodes. */
const CHILD_KEYS = ['stack', 'columns', 'ul', 'ol', 'text'] as const

function children(node: Record<string, unknown>): unknown[] {
  const found: unknown[] = []
  for (const key of CHILD_KEYS) {
    const value = node[key]
    if (Array.isArray(value)) found.push(...value)
  }
  const table = node.table as { body?: unknown[][] } | undefined
  if (table?.body) for (const row of table.body) found.push(...row)
  return found
}

function boxesOf(node: LaidOutNode, tag: BoxTag): CvContentBox[] {
  const byPage = new Map<number, Position[]>()
  for (const position of node.positions ?? []) {
    const list = byPage.get(position.pageNumber) ?? []
    list.push(position)
    byPage.set(position.pageNumber, list)
  }
  const boxes: CvContentBox[] = []
  for (const [page, positions] of byPage) {
    const x = Math.min(...positions.map((position) => position.left))
    const top = Math.min(...positions.map((position) => position.top))
    const bottom = Math.max(...positions.map((position) => position.top)) + tag.lastLine
    const columnWidth = Math.max(0, tag.right - x)
    const width = tag.fit && node._maxWidth ? Math.min(node._maxWidth, columnWidth) : columnWidth
    boxes.push({ id: tag.id, page, x, y: top, width, height: bottom - top })
  }
  return boxes
}

/** Every tagged node's boxes, in document order. Call after pdfmake has laid the definition out. */
export function collectBoxes(root: unknown): CvContentBox[] {
  const boxes: CvContentBox[] = []
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const node = value as Record<string, unknown> & LaidOutNode
    if (node.cvBox) boxes.push(...boxesOf(node, node.cvBox))
    children(node).forEach(visit)
  }
  visit(root)
  return boxes
}
