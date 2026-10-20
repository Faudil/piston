import { eq, users } from '@piston/db'
import { LoginBody } from '@piston/shared'

// A valid hash of a random password, verified when the e-mail is unknown so
// that both failure cases take the same time (no user enumeration by timing).
let dummyHash: string | undefined

export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, LoginBody.parse)

  const user = await useDb().query.users.findFirst({ where: eq(users.email, email) })
  dummyHash ??= await hashPassword(crypto.randomUUID())
  const valid = await verifyPassword(user?.passwordHash ?? dummyHash, password)

  if (!user || !valid) {
    throw createError({ statusCode: 401, message: 'E-mail ou mot de passe incorrect.' })
  }

  await startSession(event, user)
  return { ok: true }
})
