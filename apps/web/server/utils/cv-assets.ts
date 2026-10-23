import { and, cvDocumentAssets, desc, eq, inArray, type CvDocumentAssetRow } from '@piston/db'
import type { CvAssets } from '@piston/cv-render'
import {
  CV_ASSET_MAX_BYTES,
  type CvAsset,
  type CvAssetMimeType,
  type CvContent,
} from '@piston/shared'

/**
 * Binary assets of CV documents (the photo), in `cv_document_assets`.
 * Upload and download routes belong to the editor's photo feature; these
 * helpers do the checking and the storage.
 */

export interface SniffedImage {
  mimeType: CvAssetMimeType
  width: number
  height: number
}

const u16be = (bytes: Uint8Array, at: number) => (bytes[at]! << 8) | bytes[at + 1]!
const u16le = (bytes: Uint8Array, at: number) => bytes[at]! | (bytes[at + 1]! << 8)
const u24le = (bytes: Uint8Array, at: number) => u16le(bytes, at) | (bytes[at + 2]! << 16)
const u32be = (bytes: Uint8Array, at: number) =>
  ((bytes[at]! << 24) >>> 0) + ((bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!)
const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length))

/**
 * The type and size of a PNG, JPEG or WebP image, read from its bytes (magic
 * numbers and headers), or null for anything else. The client's declared
 * type is never trusted.
 */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  // PNG: signature, then the IHDR chunk with width and height.
  if (
    bytes.length >= 24 &&
    u32be(bytes, 0) === 0x89504e47 &&
    u32be(bytes, 4) === 0x0d0a1a0a &&
    ascii(bytes, 12, 4) === 'IHDR'
  ) {
    return { mimeType: 'image/png', width: u32be(bytes, 16), height: u32be(bytes, 20) }
  }
  // JPEG: SOI, then segments until a start-of-frame (SOF0-SOF15 but DHT, JPG, DAC).
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return null
      const marker = bytes[at + 1]!
      if (marker === 0xd9 || marker === 0xda) return null
      const length = u16be(bytes, at + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { mimeType: 'image/jpeg', width: u16be(bytes, at + 7), height: u16be(bytes, at + 5) }
      }
      at += 2 + length
    }
    return null
  }
  // WebP: RIFF....WEBP, then a VP8 (lossy), VP8L (lossless) or VP8X (extended) chunk.
  if (bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const chunk = ascii(bytes, 12, 4)
    if (chunk === 'VP8 ') {
      return {
        mimeType: 'image/webp',
        width: u16le(bytes, 26) & 0x3fff,
        height: u16le(bytes, 28) & 0x3fff,
      }
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const bits = (bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24)) >>> 0
      return {
        mimeType: 'image/webp',
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      }
    }
    if (chunk === 'VP8X') {
      return { mimeType: 'image/webp', width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 }
    }
  }
  return null
}

export function toCvAsset(row: Omit<CvDocumentAssetRow, 'bytes'> & { size: number }): CvAsset {
  return {
    id: row.id,
    documentId: row.documentId,
    mimeType: row.mimeType,
    size: row.size,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Stores an image for one of the user's documents (404 for another user's
 * document). Refuses anything but a PNG, JPEG or WebP image of at most
 * CV_ASSET_MAX_BYTES, with French errors.
 */
export async function saveCvAsset(
  userId: string,
  documentId: string,
  bytes: Uint8Array,
): Promise<CvAsset> {
  await getUserCvDocument(userId, documentId)
  if (bytes.length > CV_ASSET_MAX_BYTES) {
    throw createError({
      statusCode: 413,
      message: 'Cette image est trop lourde (2 Mo au maximum). Réduis-la et réessaie.',
    })
  }
  const image = sniffImage(bytes)
  if (!image || !image.width || !image.height) {
    throw createError({
      statusCode: 400,
      message: 'Ce fichier n’est pas une image PNG, JPEG ou WebP.',
    })
  }
  const [row] = await useDb()
    .insert(cvDocumentAssets)
    .values({ documentId, userId, bytes, ...image })
    .returning({
      id: cvDocumentAssets.id,
      documentId: cvDocumentAssets.documentId,
      userId: cvDocumentAssets.userId,
      mimeType: cvDocumentAssets.mimeType,
      width: cvDocumentAssets.width,
      height: cvDocumentAssets.height,
      createdAt: cvDocumentAssets.createdAt,
    })
  return toCvAsset({ ...row!, size: bytes.length })
}

/** One asset of one of the user's documents, bytes included, or null. */
export async function getCvAsset(
  userId: string,
  documentId: string,
  assetId: string,
): Promise<CvDocumentAssetRow | null> {
  const [row] = await useDb()
    .select()
    .from(cvDocumentAssets)
    .where(
      and(
        eq(cvDocumentAssets.id, assetId),
        eq(cvDocumentAssets.documentId, documentId),
        eq(cvDocumentAssets.userId, userId),
      ),
    )
  return row ?? null
}

/** An asset as a data URL, for the renderer. */
export function cvAssetDataUrl(row: Pick<CvDocumentAssetRow, 'mimeType' | 'bytes'>): string {
  return `data:${row.mimeType};base64,${Buffer.from(row.bytes).toString('base64')}`
}

/** The assets a document's content refers to (its visible photo), ready for `renderPdf`. */
export async function loadCvRenderAssets(
  userId: string,
  documentId: string,
  content: CvContent,
): Promise<CvAssets> {
  const photo = content.header.photo
  if (!photo?.visible) return {}
  const row = await getCvAsset(userId, documentId, photo.assetId)
  return row ? { images: { [row.id]: cvAssetDataUrl(row) } } : {}
}

/** Cap on the declared request size of a photo upload (the file plus multipart framing). */
export const CV_PHOTO_REQUEST_MAX_BYTES = CV_ASSET_MAX_BYTES + 64 * 1024

/**
 * Stores the photo of a document and deletes the previous one: a document
 * has at most one photo. Only JPEG and PNG are accepted, because the PDF
 * renderer cannot embed WebP (the editor converts to JPEG in the browser).
 * The document's `header.photo` is updated by the editor, which saves it
 * like any other change.
 */
export async function replaceCvPhoto(
  userId: string,
  documentId: string,
  bytes: Uint8Array,
): Promise<CvAsset> {
  await getUserCvDocument(userId, documentId)
  if (sniffImage(bytes)?.mimeType === 'image/webp') {
    throw createError({
      statusCode: 400,
      message: 'Les photos WebP ne sont pas prises en charge : utilise une image JPEG ou PNG.',
    })
  }
  const asset = await saveCvAsset(userId, documentId, bytes)
  await deleteCvAssets(userId, documentId, { except: asset.id })
  return asset
}

/** The newest asset of one of the user's documents (its photo), bytes included, or null. */
export async function getCvPhotoAsset(
  userId: string,
  documentId: string,
): Promise<CvDocumentAssetRow | null> {
  const [row] = await useDb()
    .select()
    .from(cvDocumentAssets)
    .where(and(eq(cvDocumentAssets.documentId, documentId), eq(cvDocumentAssets.userId, userId)))
    .orderBy(desc(cvDocumentAssets.createdAt))
    .limit(1)
  return row ?? null
}

/** Deletes the document's assets (all but `except`), scoped to the user. */
export async function deleteCvAssets(
  userId: string,
  documentId: string,
  options: { except?: string } = {},
): Promise<number> {
  const db = useDb()
  const rows = await db
    .select({ id: cvDocumentAssets.id })
    .from(cvDocumentAssets)
    .where(and(eq(cvDocumentAssets.documentId, documentId), eq(cvDocumentAssets.userId, userId)))
  const ids = rows.map((row) => row.id).filter((id) => id !== options.except)
  if (ids.length) await db.delete(cvDocumentAssets).where(inArray(cvDocumentAssets.id, ids))
  return ids.length
}
