import * as z from 'zod'
import type { CvShareInfo } from '@piston/shared'

/**
 * Public: whether a share link still works, and the title to show. Does not
 * count as a view. A dead link answers 404/410 with a French message.
 */
export default defineEventHandler(async (event): Promise<CvShareInfo> => {
  const { token } = await getValidatedRouterParams(
    event,
    zodValidator(z.object({ token: z.string().max(100) })),
  )
  const { document } = await resolveShareLink(token)
  setResponseHeader(event, 'x-robots-tag', 'noindex, nofollow')
  return { title: document.content.header.fullName.trim() || document.title }
})
