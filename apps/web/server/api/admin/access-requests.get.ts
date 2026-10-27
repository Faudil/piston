import * as z from 'zod'
import { accessRequestStatuses } from '@piston/shared'

const Query = z.object({ status: z.enum(accessRequestStatuses).optional() })

/** Access requests, newest first; `?status=pending` for the ones to review. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { status } = await getValidatedQuery(event, zodValidator(Query))
  return listAccessRequests(status)
})
