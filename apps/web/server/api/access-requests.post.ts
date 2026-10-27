import { AccessRequestBody } from '@piston/shared'

/**
 * Public: asks to join. An admin approves or rejects the request in /admin;
 * once approved, the requester logs in with the password chosen here.
 */
export default defineEventHandler(async (event) => {
  // Every call counts, accepted or not: the form must not become a spam pipe.
  const ip = clientIp(event)
  await assertNotThrottled(THROTTLE.accessRequestIp, ip)
  await recordAttempt(THROTTLE.accessRequestIp, ip)
  const body = await readValidatedBody(event, zodValidator(AccessRequestBody))
  await submitAccessRequest(body)
  return { ok: true }
})
