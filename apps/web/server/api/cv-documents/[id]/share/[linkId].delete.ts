import * as z from 'zod'
import { IdParam } from '@piston/shared'

/** Revokes a share link: the URL stops working at once. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id, linkId } = await getValidatedRouterParams(
    event,
    zodValidator(IdParam.extend({ linkId: z.uuid() })),
  )
  return revokeShareLink(user.id, id, linkId)
})
