/**
 * Content-Security-Policy for pages. Everything comes from our own origin.
 *
 * - Scripts: same origin plus the per-request nonce that plugins/csp-nonce.ts
 *   puts on the inline scripts Nuxt renders (page data, color mode). No
 *   `unsafe-inline`, no `unsafe-eval`. `wasm-unsafe-eval` lets pdf.js (CV
 *   preview) run its WebAssembly image decoders.
 * - Styles keep `unsafe-inline`: Vue and Nuxt UI write style attributes and
 *   <style> tags that cannot be nonced. Style injection is a much weaker
 *   attack than script injection; the real fix is not available in Vue.
 * - Images allow `data:` and `blob:` (photo upload preview and crop).
 * - Workers allow `blob:` (the CV renderer and pdf.js start module workers).
 * - Nothing may embed the app (`frame-ancestors 'none'`), and the app embeds nothing.
 */
export function buildCsp(nonce: string, dev: boolean) {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'wasm-unsafe-eval'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
    'frame-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
  // The dev server's hot reload uses a WebSocket and eval.
  if (dev) {
    directives['connect-src']!.push('ws:', 'wss:')
    directives['script-src']!.push("'unsafe-eval'")
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}

export const PERMISSIONS_POLICY = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'interest-cohort=()',
].join(', ')
