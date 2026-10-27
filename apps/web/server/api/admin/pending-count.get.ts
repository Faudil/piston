/** Number of access requests waiting, for the badge next to « Administration ». */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { pending: await countPendingRequests() }
})
