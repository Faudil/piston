import { cvFontPairings, type CvFontFamily, type CvFontPairingId } from '@piston/shared'

/**
 * Loads the CV fonts into the page (FontFace API) so the design panel can
 * show each pairing in its real typefaces. Same WOFF files as the PDF
 * preview (`/cv-fonts/`, cached 30 days). Only the regular and bold normal
 * styles, only when a pairing is looked at.
 */

const loaded = new Map<string, Promise<void>>()

/** CSS font-family name of a CV family, for inline styles. */
export const cvFontCssFamily = (family: CvFontFamily) => `cv-${family}`

function loadFamily(family: CvFontFamily): Promise<void> {
  const existing = loaded.get(family)
  if (existing) return existing
  const task = Promise.all(
    ([400, 700] as const).map(async (weight) => {
      const face = new FontFace(
        cvFontCssFamily(family),
        `url(/cv-fonts/${family}-${weight}-normal.woff) format('woff')`,
        { weight: String(weight), display: 'swap' },
      )
      document.fonts.add(await face.load())
    }),
  ).then(
    () => undefined,
    () => {
      // A missing font falls back to the page's font: the sample is only a hint.
      loaded.delete(family)
    },
  )
  loaded.set(family, task)
  return task
}

/** Starts loading the families of the pairings; resolves when all are ready. */
export function loadCvFontSamples(pairings: readonly CvFontPairingId[]): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve()
  const families = new Set(
    pairings.flatMap((id) => [cvFontPairings[id].heading, cvFontPairings[id].body]),
  )
  return Promise.all([...families].map(loadFamily)).then(() => undefined)
}
