import { eq, users } from '@piston/db'
import { DeleteAccountBody } from '@piston/shared'

/**
 * Permanently deletes the account. The user must type their own e-mail as a
 * confirmation. Resumes, offers, generations and applications go with it by
 * cascade; the invites they created are kept (created_by is set to null).
 */
export default defineEventHandler(async (event) => {
  const sessionUser = await requireUser(event)
  const { confirmEmail } = await readValidatedBody(event, zodValidator(DeleteAccountBody))
  const user = await getAccountUser(sessionUser.id)
  if (confirmEmail !== user.email.toLowerCase()) {
    throw createError({
      statusCode: 400,
      message: "L'adresse e-mail saisie ne correspond pas à celle du compte.",
    })
  }
  await useDb().delete(users).where(eq(users.id, user.id))
  await clearUserSession(event)
  return { ok: true }
})
