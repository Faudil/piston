import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { CvFontLoader } from './types'

/**
 * Node and Bun helpers (not for the browser bundle): the font files of this
 * package, read from disk. The Nuxt server does not use this in production
 * (its bundle has no `packages/` directory); it reads the same files as
 * Nitro server assets.
 */

/** Absolute path of packages/cv-render/fonts/, with a trailing slash. */
export const CV_FONTS_DIR = fileURLToPath(new URL('../fonts/', import.meta.url))

/** A font loader reading from a directory (default: this package's fonts). */
export function nodeFontLoader(directory: string = CV_FONTS_DIR): CvFontLoader {
  const base = directory.endsWith('/') ? directory : `${directory}/`
  return async (file) => new Uint8Array(await readFile(base + file))
}
