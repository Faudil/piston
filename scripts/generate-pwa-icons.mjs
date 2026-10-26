// Renders the app icons (PWA manifest, iOS home screen) from the brand mark of
// apps/web/app/components/app/Logo.vue, with the palette colors resolved.
// Run after changing the mark:  bun scripts/generate-pwa-icons.mjs
// Needs a Chromium: PW_CHROMIUM_PATH, or the one Playwright installed.
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const OUT = new URL('../apps/web/public/icons/', import.meta.url)

/** The mark on a 32 x 32 grid (colors = --color-piston-400 / 600 / 700). */
const mark = (id) => `
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#a8350c"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="9" fill="url(#${id})"/>
  <rect x="8" y="6.5" width="16" height="10" rx="2.5" fill="#fff"/>
  <path d="M8 10h16M8 13h16" stroke="#c8410b" stroke-width="1.2"/>
  <path d="M16 16.5v7" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
  <circle cx="16" cy="24.5" r="3" fill="none" stroke="#fff" stroke-width="2"/>`

/** Rounded tile (any purpose), or full-bleed square with the mark in the safe zone (maskable, iOS). */
function svg(kind, size) {
  if (kind === 'rounded') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">${mark('g')}</svg>`
  }
  // Maskable icons keep their content inside the central 80 %: the mark is
  // drawn at 62 % on a gradient square that bleeds to the edges.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
    <defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#a8350c"/></linearGradient></defs>
    <rect width="32" height="32" fill="url(#b)"/>
    <g transform="translate(16 16) scale(0.62) translate(-16 -16)">
      <rect x="8" y="6.5" width="16" height="10" rx="2.5" fill="#fff"/>
      <path d="M8 10h16M8 13h16" stroke="#c8410b" stroke-width="1.2"/>
      <path d="M16 16.5v7" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      <circle cx="16" cy="24.5" r="3" fill="none" stroke="#fff" stroke-width="2"/>
    </g></svg>`
}

const files = [
  ['icon-192.png', 'rounded', 192],
  ['icon-512.png', 'rounded', 512],
  ['icon-maskable-512.png', 'full', 512],
  ['apple-touch-icon.png', 'full', 180],
]

await mkdir(OUT, { recursive: true })
await writeFile(new URL('icon.svg', OUT), svg('rounded', 32).replace(' width="32" height="32"', ''))

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined })
const page = await browser.newPage()
for (const [name, kind, size] of files) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}</style>${svg(kind, size)}`,
  )
  await writeFile(new URL(name, OUT), await page.screenshot({ omitBackground: true }))
  console.log('wrote', name)
}
await browser.close()
