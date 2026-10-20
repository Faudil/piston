import { and, eq, gte, invites, isNull, users } from '@piston/db'
import { RegisterBody } from '@piston/shared'

/** Creates an account from an invitation link. There is no other way to sign up. */
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, RegisterBody.parse)
  const passwordHash = await hashPassword(body.password)

  const user = await useDb().transaction(async (tx) => {
    // Marking the invite as used in the same statement that checks it makes
    // the link single-use even if two sign-ups race.
    const [invite] = await tx
      .update(invites)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(invites.token, body.token),
          isNull(invites.usedAt),
          gte(invites.expiresAt, new Date()),
        ),
      )
      .returning()
    if (!invite) {
      throw createError({
        statusCode: 400,
        message: "Ce lien d'invitation est invalide ou expiré.",
      })
    }

    const existing = await tx.query.users.findFirst({ where: eq(users.email, body.email) })
    if (existing) {
      throw createError({ statusCode: 409, message: 'Un compte existe déjà avec cet e-mail.' })
    }

    const [created] = await tx
      .insert(users)
      .values({ email: body.email, displayName: body.displayName, passwordHash })
      .returning()
    return created!
  })

  await startSession(event, user)
  return { ok: true }
})
