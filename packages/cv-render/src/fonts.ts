import {
  cvFontFamilies,
  cvFontPairings,
  type CvFontFamily,
  type CvFontPairingId,
} from '@piston/shared'
import type { CvFontLoader, CvPdfMake } from './types'

/**
 * The fonts embedded in CV PDFs, from packages/cv-render/fonts: WOFF files,
 * Latin + Latin Extended, SIL Open Font License (license files next to
 * them; rebuilt by scripts/build-fonts.sh).
 *
 * WOFF rather than WOFF2: fontkit, used by pdfkit to subset fonts, fails on
 * WOFF2 composite glyphs. pdfkit embeds only the glyphs a PDF uses, so the
 * PDF stays small whatever the file size.
 *
 * Fonts are loaded lazily, per family: the browser fetches only the
 * families of the pairing being rendered.
 */

/** pdfmake style key → file suffix. */
const STYLE_FILES = {
  normal: '400-normal',
  bold: '700-normal',
  italics: '400-italic',
  bolditalics: '700-italic',
} as const
type FontStyle = keyof typeof STYLE_FILES

/**
 * Heading-only families ship regular and bold, not italics: their italic
 * styles map to the upright files (nothing in the templates sets a heading
 * in italics; this only avoids a crash if something did).
 */
const UPRIGHT_ONLY = new Set<CvFontFamily>(['playfair-display', 'montserrat', 'lora', 'poppins'])

/** Name of a family in pdfmake's font dictionary: `source-serif-4` → `SourceSerif4`. */
export function cvFontFamilyName(family: CvFontFamily): string {
  return family
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function fileFor(family: CvFontFamily, style: FontStyle): string {
  const effective = UPRIGHT_ONLY.has(family)
    ? style === 'italics'
      ? 'normal'
      : style === 'bolditalics'
        ? 'bold'
        : style
    : style
  return `${family}-${STYLE_FILES[effective]}.woff`
}

/** The font files of the given families (default: all), e.g. `inter-700-italic.woff`. */
export function cvFontFiles(families: readonly CvFontFamily[] = cvFontFamilies): string[] {
  const files = new Set<string>()
  for (const family of families) {
    for (const style of Object.keys(STYLE_FILES) as FontStyle[]) files.add(fileFor(family, style))
  }
  return [...files]
}

/** The families a pairing uses (one or two). */
export function cvPairingFamilies(pairing: CvFontPairingId): CvFontFamily[] {
  const { heading, body } = cvFontPairings[pairing]
  return heading === body ? [heading] : [heading, body]
}

/** pdfmake's font dictionary for every family; files are read from its virtual file system. */
export function cvFontDictionary(): Record<string, Record<FontStyle, string>> {
  return Object.fromEntries(
    cvFontFamilies.map((family) => [
      cvFontFamilyName(family),
      Object.fromEntries(
        (Object.keys(STYLE_FILES) as FontStyle[]).map((style) => [style, fileFor(family, style)]),
      ) as Record<FontStyle, string>,
    ]),
  )
}

/** Base64 of bytes, without Node's Buffer (also runs in a Web Worker). */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

/** Per pdfmake instance: the font dictionary is set, and these files are loaded. */
const prepared = new WeakMap<CvPdfMake, Set<string>>()

/**
 * Makes a pdfmake instance ready for CV rendering: registers the font
 * dictionary and denies every URL and local file access, once; then loads
 * the files of `families` that are not loaded yet (concurrently). Safe to
 * call before every render.
 */
export async function prepareCvPdfMake(
  pdfmake: CvPdfMake,
  families: readonly CvFontFamily[],
  loadFont: CvFontLoader,
): Promise<void> {
  let loaded = prepared.get(pdfmake)
  if (!loaded) {
    loaded = new Set()
    prepared.set(pdfmake, loaded)
    pdfmake.setFonts(cvFontDictionary())
    // Documents never contain URLs to fetch: images come as data URLs.
    pdfmake.setUrlAccessPolicy(() => false)
    pdfmake.setLocalAccessPolicy?.(() => false)
  }
  const missing = cvFontFiles(families).filter((file) => !loaded.has(file))
  await Promise.all(
    missing.map(async (file) => {
      const bytes = await loadFont(file)
      pdfmake.virtualfs.writeFileSync(file, toBase64(bytes), 'base64')
      loaded.add(file)
    }),
  )
}
