import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import type { CvContent, CvDesign, CvTemplateId } from '@piston/shared'

/**
 * Public types of `@piston/cv-render`. These are the contracts the editor
 * (Web Worker preview, click-to-edit), the server (exports) and later work
 * packages build on: change them with care.
 */

/** What to render: a document as stored (the design holds only the user's overrides). */
export interface CvRenderInput {
  content: CvContent
  design: CvDesign
  templateId: CvTemplateId
}

/**
 * Binary resources a document refers to, resolved by the caller. The
 * renderer never fetches anything (URL and file access are denied in
 * pdfmake).
 */
export interface CvAssets {
  /**
   * Images by asset id (`content.header.photo.assetId`), as data URLs.
   * PNG and JPEG only: pdfkit cannot embed WebP, so a WebP photo is ignored
   * (convert it before, e.g. with a canvas in the browser).
   */
  images?: Record<string, string>
}

/**
 * Where a piece of content was drawn, for click-to-edit and highlights.
 * Coordinates are PDF points from the top-left corner of the page. A piece
 * of content split across pages or columns has one box per part.
 */
export interface CvContentBox {
  /** A content id, see `cvContentId` / `parseCvContentId` (ids.ts). */
  id: string
  /** 1-based page number. */
  page: number
  x: number
  y: number
  width: number
  height: number
}

export interface CvRenderResult {
  /** The PDF file. */
  pdf: Uint8Array
  pageCount: number
  /** Page size in points (A4: 595.28 × 841.89, Letter: 612 × 792). */
  pageSize: { width: number; height: number }
  /** Content boxes in document order. */
  boxes: CvContentBox[]
  /**
   * How full the last page is, from 0 (empty) to 1 (down to the bottom
   * margin). A two-page CV whose second page is at 0.1 almost fits on one.
   */
  lastPageFill: number
}

/** A pdfmake document definition, as `render` returns it. */
export type CvDocumentDefinition = TDocumentDefinitions

/**
 * The parts of pdfmake 0.3 the renderer uses. Both the Node build
 * (`import pdfmake from 'pdfmake'`) and the browser build
 * (`pdfmake/build/pdfmake.js`) provide them; the caller passes its own
 * instance, so this package never imports pdfmake at runtime.
 */
export interface CvPdfMake {
  virtualfs: {
    writeFileSync(name: string, data: string, encoding: 'base64'): void
    existsSync(name: string): boolean
  }
  setFonts(fonts: Record<string, Record<string, string>>): void
  setUrlAccessPolicy(callback: (url: string) => boolean): void
  setLocalAccessPolicy?(callback: (path: string) => boolean): void
  createPdf(definition: TDocumentDefinitions): {
    getBuffer(): Promise<Uint8Array>
  }
}

/**
 * Reads one font file (e.g. `inter-400-normal.woff`) from wherever the
 * caller keeps them: `fetch('/cv-fonts/…')` in the browser, the file system
 * or Nitro server assets on the server.
 */
export type CvFontLoader = (file: string) => Promise<Uint8Array>
