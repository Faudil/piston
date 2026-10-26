import { JobSearchBody, type JobSearchResponse } from '@piston/shared'

/** Searches live job offers on French job boards through Tavily. */
export default defineEventHandler(async (event): Promise<JobSearchResponse> => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, zodValidator(JobSearchBody))
  if (!isWebSearchEnabled()) {
    throw createError({
      statusCode: 503,
      message: "La recherche web n'est pas configurée sur ce serveur.",
    })
  }
  return { results: await searchJobs(user.id, body.query, body.location || undefined) }
})
