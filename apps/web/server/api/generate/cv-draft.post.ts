import { cvImportPrompt, cvInterviewPrompt, wrapInterview, wrapResume } from '@piston/prompts'
import { CvDraftBody, CvDraftOutput } from '@piston/shared'

/**
 * Streams the first draft of a CV document (kind `cv_draft`): a resume
 * version structured as it is (`import`), or the interview answers turned
 * into a draft (`interview`). The client then creates the document with
 * `POST /api/cv-documents { fromGenerationId }`.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, zodValidator(CvDraftBody))
  const ctx = { displayName: user.displayName }

  if (body.mode === 'import') {
    const resume = await getResumeForGeneration(user.id, body)
    return streamGeneration(event, {
      kind: 'cv_draft',
      userId: user.id,
      system: cvImportPrompt(ctx),
      resume: wrapResume(resume.rawText),
      request: 'Structure this resume into the CV document format.',
      inputRefs: { resumeId: resume.id, profileId: resume.profileId, cvMode: 'import' },
      output: { schema: CvDraftOutput },
    })
  }

  // The document is created in this profile (checked here), else the default one.
  const profile = body.profileId
    ? await getUserProfile(user.id, body.profileId)
    : await findDefaultProfile(user.id)
  return streamGeneration(event, {
    kind: 'cv_draft',
    userId: user.id,
    system: cvInterviewPrompt(ctx),
    resume: wrapInterview(body.answers),
    request: 'Write the first draft of the CV from these answers.',
    inputRefs: { ...(profile && { profileId: profile.id }), cvMode: 'interview' },
    output: { schema: CvDraftOutput },
  })
})
