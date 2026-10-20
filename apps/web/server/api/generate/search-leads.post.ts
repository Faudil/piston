import { buildUserMessage, searchLeadsPrompt } from '@piston/prompts'
import { SearchLeadsBody, SearchLeadsOutput } from '@piston/shared'

/** Suggests adjacent jobs, search keywords and target company types from the current resume. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  await readValidatedBody(event, zodValidator(SearchLeadsBody))
  const resume = await getResumeForGeneration(user.id)

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
    inputRefs: { resumeId: resume.id },
    output: { schema: SearchLeadsOutput },
  })
})
