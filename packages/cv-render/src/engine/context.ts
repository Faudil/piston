import type { CvContent } from '@piston/shared'
import type { CvAssets } from '../types'
import type { Region } from './boxes'
import type { CvTokens } from './tokens'

/** What every block receives: the tokens, the document, and the column it is drawn in. */
export interface BlockContext {
  t: CvTokens
  content: CvContent
  assets: CvAssets
  region: Region
}

/** A margin tuple, typed for pdfmake (array literals widen to number[]). */
export function margin(left: number, top: number, right: number, bottom: number): Margins {
  return [left, top, right, bottom]
}

type Margins = [number, number, number, number]

export const regionWidth = (region: Region) => region.right - region.left

/** Height of one line of text at `fontSize`, for box estimates (ascent + descent ≈ 1.2 em). */
export function lineBox(ctx: BlockContext, fontSize: number): number {
  return fontSize * ctx.t.lineHeight * 1.2
}
