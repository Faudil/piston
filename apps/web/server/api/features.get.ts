import type { Features } from '@piston/shared'

/** Which optional features this server has enabled, so the UI can hide the others. */
export default defineEventHandler(async (event): Promise<Features> => {
  await requireUser(event)
  return { webSearch: isWebSearchEnabled() }
})
