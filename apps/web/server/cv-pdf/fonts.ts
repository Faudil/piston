import type { CvFont } from '@piston/shared'
import { PDF_FONT_FAMILY } from './shared'

/**
 * The fonts embedded in CV PDFs: Inter, Lato and Source Serif 4, Latin
 * subset (French included), from Fontsource, under the SIL Open Font License
 * (license files next to them in server/assets/cv-fonts).
 *
 * WOFF rather than WOFF2: fontkit, used by pdfkit to subset fonts, fails on
 * WOFF2 composite glyphs. pdfkit embeds only the glyphs a PDF uses.
 */
const FILE_PREFIX: Record<CvFont, string> = {
  inter: 'inter',
  lato: 'lato',
  'source-serif': 'source-serif-4',
}

const STYLES = {
  normal: '400-normal',
  bold: '700-normal',
  italics: '400-italic',
  bolditalics: '700-italic',
} as const

/** Every font file name, e.g. `inter-latin-700-italic.woff`. */
export function cvFontFiles(): string[] {
  return Object.values(FILE_PREFIX).flatMap((prefix) =>
    Object.values(STYLES).map((style) => `${prefix}-latin-${style}.woff`),
  )
}

/** The pdfmake font dictionary, whose values are names in pdfmake's virtual file system. */
export function cvFontDictionary() {
  return Object.fromEntries(
    (Object.keys(FILE_PREFIX) as CvFont[]).map((font) => [
      PDF_FONT_FAMILY[font],
      Object.fromEntries(
        Object.entries(STYLES).map(([style, file]) => [
          style,
          `${FILE_PREFIX[font]}-latin-${file}.woff`,
        ]),
      ) as Record<keyof typeof STYLES, string>,
    ]),
  )
}
