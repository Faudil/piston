import { DismissHintBody } from '@piston/shared'

/** Closes one onboarding message for good, on every device. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { hint } = await readValidatedBody(event, zodValidator(DismissHintBody))
  await dismissHint(user.id, hint)
  return { ok: true }
})
