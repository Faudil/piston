/** Color helpers of the CV design (all colors are `#rrggbb`). Pure. */

/** Mixes a #rrggbb color with white: 0 = the color, 1 = white. */
export function tintColor(hex: string, amount: number): string {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16))
  return `#${channels
    .map((channel) => Math.round(channel + (255 - channel) * amount))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

/** WCAG relative luminance of a #rrggbb color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** WCAG contrast ratio between two #rrggbb colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

/** Dark text color used on light backgrounds. */
export const CV_INK = '#1c1917'

/** `#1c1917` or white, whichever has the better contrast on `background`. */
export function readableOn(background: string): string {
  return contrastRatio(CV_INK, background) >= contrastRatio('#ffffff', background)
    ? CV_INK
    : '#ffffff'
}

/**
 * Moves `foreground` towards black (on a light background) or white (on a
 * dark one) until it reaches `minRatio` against `background`. Keeps the hue,
 * so an accent color stays recognizable. Returns it unchanged when it
 * already passes.
 */
export function ensureContrast(foreground: string, background: string, minRatio = 4.5): string {
  if (contrastRatio(foreground, background) >= minRatio) return foreground
  const towards = readableOn(background) === '#ffffff' ? '#ffffff' : '#000000'
  for (let step = 1; step <= 20; step++) {
    const candidate = mixColors(foreground, towards, step / 20)
    if (contrastRatio(candidate, background) >= minRatio) return candidate
  }
  return towards
}

/** Mixes two #rrggbb colors: 0 = `from`, 1 = `to`. */
export function mixColors(from: string, to: string, amount: number): string {
  const channel = (hex: string, index: number) => parseInt(hex.slice(index, index + 2), 16)
  return `#${[1, 3, 5]
    .map((index) =>
      Math.round(channel(from, index) + (channel(to, index) - channel(from, index)) * amount),
    )
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`
}
