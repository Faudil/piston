/** The onboarding messages (welcome, page tips) the user already closed. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return { dismissed: await getDismissedHints(user.id) }
})
