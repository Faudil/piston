import * as z from 'zod'

/** Public: tells the sign-up page whether an invitation link can still be used. */
export default defineEventHandler(async (event) => {
  // Every call counts, valid or not: this route would otherwise let anyone
  // test invitation tokens at full speed.
  await throttleInviteCheck(event)

  const { token } = await getValidatedRouterParams(
    event,
    zodValidator(z.object({ token: z.string().min(1).max(100) })),
  )
  const invite = await findValidInvite(token)
  return { valid: Boolean(invite), expiresAt: invite?.expiresAt.toISOString() ?? null }
})
