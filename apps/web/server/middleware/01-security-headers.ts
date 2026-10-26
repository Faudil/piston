import { buildCsp, PERMISSIONS_POLICY } from '../utils/security-headers'

/**
 * Security headers on every response. The CSP applies to pages (API answers
 * are JSON or files and need none, but get the other headers). In development
 * the policy is only reported (`Content-Security-Policy-Report-Only`), because
 * Vite injects scripts that no nonce covers; production enforces it, unless
 * CSP_REPORT_ONLY=true (to try a new policy without breaking anything: the
 * browser console lists what it would have blocked).
 */
export default defineEventHandler((event) => {
  const nonce = crypto.randomUUID().replaceAll('-', '')
  event.context.cspNonce = nonce

  const dev = import.meta.dev
  const reportOnly = dev || Boolean(useRuntimeConfig().cspReportOnly)
  setResponseHeaders(event, {
    [reportOnly ? 'content-security-policy-report-only' : 'content-security-policy']: buildCsp(
      nonce,
      dev,
    ),
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY', // for browsers that predate frame-ancestors
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': PERMISSIONS_POLICY,
    'cross-origin-opener-policy': 'same-origin',
  })

  // HSTS tells browsers to refuse plain HTTP for this host: only send it
  // when this very request came over HTTPS (directly, or via the proxy).
  const proto = getRequestProtocol(event, {
    xForwardedProto: Boolean(useRuntimeConfig().trustProxy),
  })
  if (!dev && proto === 'https') {
    setResponseHeader(event, 'strict-transport-security', 'max-age=31536000')
  }
})
