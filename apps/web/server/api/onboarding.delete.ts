/** Shows the welcome dialog and the page tips again. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  await resetHints(user.id)
  return { ok: true }
})
