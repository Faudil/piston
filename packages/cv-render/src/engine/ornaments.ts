import type { CanvasElement } from 'pdfmake/interfaces'
import { tintColor } from '@piston/shared'
import type { CvTokens } from './tokens'

/**
 * Decorative shapes behind the page (the template's `ornament`): canvas
 * drawn by the page background, so they never hold text, never change the
 * reading order and repeat on every page. Shapes that may sit behind text
 * use light tints only (≥ 82 % towards white), so the text keeps its
 * contrast; solid accent shapes stay in the page margins.
 */

/** Width of the `strip` ornament along the left edge. */
export const ORNAMENT_STRIP = 12

export function ornamentCanvas(
  t: CvTokens,
  page: number,
  options: { avoid?: { left: number; right: number } },
): CanvasElement[] {
  const ornament = t.design.typography.ornament ?? 'none'
  const { width: W, height: H } = t.page
  const avoid = options.avoid
  const clear = (x: number) => !avoid || x < avoid.left || x > avoid.right
  const accent = t.colors.primary
  const light = tintColor(accent, 0.82)
  const lighter = tintColor(accent, 0.9)

  if (ornament === 'strip') {
    if (!clear(1)) return []
    return [
      { type: 'rect', x: 0, y: 0, w: ORNAMENT_STRIP, h: H, color: accent },
      { type: 'rect', x: ORNAMENT_STRIP, y: 0, w: 3, h: H, color: light },
    ]
  }
  if (ornament !== 'shapes') return []

  const shapes: CanvasElement[] = []
  if (clear(W - 1)) {
    // A wedge in the top right corner, a circle over it.
    shapes.push({
      type: 'polyline',
      points: [
        { x: W - (page === 1 ? 250 : 140), y: 0 },
        { x: W, y: 0 },
        { x: W, y: page === 1 ? 210 : 120 },
      ],
      closePath: true,
      color: lighter,
    })
    if (page === 1) {
      shapes.push({ type: 'ellipse', x: W - 34, y: 26, r1: 64, r2: 64, color: light })
    }
  }
  if (page === 1 && clear(1)) {
    // Bottom left: a tinted quarter circle and a small solid dot, in the margin.
    shapes.push(
      { type: 'ellipse', x: 0, y: H, r1: 96, r2: 96, color: lighter },
      { type: 'ellipse', x: 52, y: H - 18, r1: 7, r2: 7, color: accent },
      { type: 'ellipse', x: 74, y: H - 18, r1: 3.5, r2: 3.5, color: tintColor(accent, 0.45) },
    )
  }
  return shapes
}
