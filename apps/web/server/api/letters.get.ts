/** The « Lettres » page: one entry per application or offer, with its latest version. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return listLetterSummaries(user.id)
})
