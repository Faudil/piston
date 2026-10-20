import { eq, users } from '@piston/db'
import { UpdateAccountBody } from '@piston/shared'

/** Changes the display name, and refreshes the session cookie that carries it. */
export default defineEventHandler(async (event) => {
  const sessionUser = await requireUser(event)
  const { displayName } = await readValidatedBody(event, zodValidator(UpdateAccountBody))
  const [user] = await useDb()
    .update(users)
    .set({ displayName })
    .where(eq(users.id, sessionUser.id))
    .returning()
  if (!user) throw createError({ statusCode: 401, message: 'Connecte-toi pour continuer.' })
  await startSession(event, user)
  return { id: user.id, email: user.email, displayName: user.displayName }
})
