import { buildUserMessage, resumeReviewPrompt } from '@piston/prompts'
import { ResumeReviewBody, ResumeReviewOutput } from '@piston/shared'

/**
 * Streams a frank review of a resume: the version `resumeId`, else the current
 * version of `profileId`, else that of the default profile.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  // The body is optional: no body means "review my current resume".
  const body = await readValidatedBody(event, (raw) => zodValidator(ResumeReviewBody)(raw ?? {}))
  const resume = await getResumeForGeneration(user.id, body)

  const { resume: resumeBlock, request } = buildUserMessage({
    resume: resume.rawText,
    instruction: 'Review this resume.',
  })

  return streamGeneration(event, {
    kind: 'resume_review',
    userId: user.id,
    system: resumeReviewPrompt({ displayName: user.displayName }),
    resume: resumeBlock,
    request,
    inputRefs: { resumeId: resume.id, profileId: resume.profileId },
    output: { schema: ResumeReviewOutput },
  })
})
