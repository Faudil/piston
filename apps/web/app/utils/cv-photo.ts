/**
 * Photo helpers of the CV editor: crop geometry (pure, tested) and the
 * canvas work that turns a picked file into a square JPEG. pdfkit cannot
 * embed WebP, so whatever the user picks is re-encoded as JPEG here.
 */

/** Largest side of the uploaded photo, in pixels. */
export const CV_PHOTO_MAX_SIDE = 800
export const CV_PHOTO_MAX_ZOOM = 4

/**
 * The crop window: `zoom` 1 shows the largest centered square of the image,
 * 4 a square four times smaller; `cx`, `cy` are its center in image pixels.
 */
export interface PhotoCrop {
  zoom: number
  cx: number
  cy: number
}

export interface PhotoRect {
  x: number
  y: number
  side: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** The square (in image pixels) a crop selects, always inside the image. */
export function photoCropRect(width: number, height: number, crop: PhotoCrop): PhotoRect {
  const zoom = clamp(crop.zoom, 1, CV_PHOTO_MAX_ZOOM)
  const side = Math.min(width, height) / zoom
  return {
    x: clamp(crop.cx - side / 2, 0, width - side),
    y: clamp(crop.cy - side / 2, 0, height - side),
    side,
  }
}

/** The same crop with its center moved so the window stays inside the image. */
export function clampPhotoCrop(width: number, height: number, crop: PhotoCrop): PhotoCrop {
  const zoom = clamp(crop.zoom, 1, CV_PHOTO_MAX_ZOOM)
  const rect = photoCropRect(width, height, { ...crop, zoom })
  return { zoom, cx: rect.x + rect.side / 2, cy: rect.y + rect.side / 2 }
}

/** The centered full-square crop an image starts with. */
export function initialPhotoCrop(width: number, height: number): PhotoCrop {
  return { zoom: 1, cx: width / 2, cy: height / 2 }
}

/** Side in pixels of the exported photo: the crop's own size, never upscaled, at most 800. */
export function photoOutputSide(cropSide: number): number {
  return Math.max(1, Math.min(CV_PHOTO_MAX_SIDE, Math.round(cropSide)))
}

export type PhotoSource = ImageBitmap | HTMLImageElement

/** Decodes a picked file (EXIF orientation applied). Throws a French message if the browser cannot read it. */
export async function loadPhotoSource(file: Blob): Promise<PhotoSource> {
  try {
    if (typeof createImageBitmap === 'function') {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    }
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      return image
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    throw new Error('Impossible de lire cette image. Essaie un fichier JPEG ou PNG.')
  }
}

export const photoSourceSize = (source: PhotoSource) =>
  source instanceof HTMLImageElement
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height }

/** Renders the crop as a square JPEG of at most 800 px (white behind transparency), under `maxBytes`. */
export async function cropPhotoToJpeg(
  source: PhotoSource,
  rect: PhotoRect,
  maxBytes: number,
): Promise<Blob> {
  const side = photoOutputSide(rect.side)
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const context = canvas.getContext('2d')!
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, side, side)
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, rect.x, rect.y, rect.side, rect.side, 0, 0, side, side)
  for (const quality of [0.9, 0.8, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (blob && blob.size <= maxBytes) return blob
  }
  throw new Error('Cette photo reste trop lourde (2 Mo au maximum). Choisis-en une plus petite.')
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
