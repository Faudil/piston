import { eq, users } from '@piston/db'
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
  await useDb()
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(users.id, user.id))
  return { ok: true }
})
