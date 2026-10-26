import { eq, sql, users } from '@piston/db'
import { ChangePasswordBody } from '@piston/shared'

/** Changes the password after checking the current one. */
export default defineEventHandler(async (event) => {
  const sessionUser = await requireUser(event)
  const { currentPassword, newPassword } = await readValidatedBody(
    event,
    zodValidator(ChangePasswordBody),
  )
  const user = await getAccountUser(sessionUser.id)
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw createError({ statusCode: 400, message: 'Le mot de passe actuel est incorrect.' })
  }
  // Bumping the version logs the user out of every other device; this one
  // gets a fresh session right away.
  const [updated] = await useDb()
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.id, user.id))
    .returning()
  await startSession(event, updated!)
  return { ok: true }
})
