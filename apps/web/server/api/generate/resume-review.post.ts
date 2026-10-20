import { buildUserMessage, resumeReviewPrompt } from '@piston/prompts'
import { ResumeReviewBody, ResumeReviewOutput } from '@piston/shared'

/** Streams a frank review of the user's resume (current one by default). */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  // The body is optional: no body means "review my current resume".
  const body = await readValidatedBody(event, (raw) => zodValidator(ResumeReviewBody)(raw ?? {}))
  const resume = await getResumeForGeneration(user.id, body.resumeId)

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
    inputRefs: { resumeId: resume.id },
    output: { schema: ResumeReviewOutput },
  })
})
