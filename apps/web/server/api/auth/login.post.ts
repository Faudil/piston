import { eq, users } from '@piston/db'
import { LoginBody } from '@piston/shared'

// A valid hash of a random password, verified when the e-mail is unknown so
// that both failure cases take the same time (no user enumeration by timing).
let dummyHash: string | undefined

export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, zodValidator(LoginBody))

  // Checked before the password, so a locked-out key learns nothing about it.
  const ip = clientIp(event)
  await assertNotThrottled(THROTTLE.loginIp, ip)
  await assertNotThrottled(THROTTLE.loginEmail, email)

  const user = await useDb().query.users.findFirst({ where: eq(users.email, email) })
  dummyHash ??= await hashPassword(crypto.randomUUID())
  const valid = await verifyPassword(user?.passwordHash ?? dummyHash, password)

  if (!user || !valid) {
    // Right password for a request still waiting: say so rather than « incorrect ».
    if (!user && (await hasPendingRequest(email, password))) {
      throw createError({
        statusCode: 403,
        message:
          "Ta demande d'accès est en attente : tu pourras te connecter dès qu'elle sera acceptée.",
      })
    }
    await recordAttempt(THROTTLE.loginIp, ip)
    await recordAttempt(THROTTLE.loginEmail, email)
    throw createError({ statusCode: 401, message: 'E-mail ou mot de passe incorrect.' })
  }

  await clearAttempts(THROTTLE.loginEmail, email)
  await startSession(event, user)
  return { ok: true }
})
