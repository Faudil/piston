import { buildUserMessage, searchLeadsPrompt } from '@piston/prompts'
import { SearchLeadsBody, SearchLeadsOutput } from '@piston/shared'

/** Suggests adjacent jobs, search keywords and target company types from the current resume of a profile. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  // The body is optional: no body means "use the default profile".
  const { profileId } = await readValidatedBody(event, (raw) =>
    zodValidator(SearchLeadsBody)(raw ?? {}),
  )
  const resume = await getResumeForGeneration(user.id, { profileId })

  const { resume: resumeBlock, request } = buildUserMessage({
    resume: resume.rawText,
    instruction: 'Suggest job-search leads based on this resume.',
  })

  return streamGeneration(event, {
    kind: 'search_leads',
    userId: user.id,
    system: searchLeadsPrompt({ displayName: user.displayName }),
    resume: resumeBlock,
    request,
    inputRefs: { resumeId: resume.id, profileId: resume.profileId },
    output: { schema: SearchLeadsOutput },
  })
})
