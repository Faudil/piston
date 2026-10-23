import { and, eq, generations } from '@piston/db'
import {
  CreateCvDocumentBody,
  CvDraftOutput,
  applyTemplateSectionOrder,
  createBlankCv,
  cvTemplates,
  draftToContent,
} from '@piston/shared'

/**
 * Creates a CV document: blank (with the user's name), or from a `cv_draft`
 * generation, i.e. the structured draft Claude made from a resume version or
 * from the interview answers.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, zodValidator(CreateCvDocumentBody))

  let content = createBlankCv(user.displayName)
  let profileId = body.profileId
  let revisionLabel = 'Création'

  if (body.fromGenerationId) {
    const generation = await useDb().query.generations.findFirst({
      where: and(
        eq(generations.id, body.fromGenerationId),
        eq(generations.userId, user.id),
        eq(generations.kind, 'cv_draft'),
      ),
    })
    if (!generation) throw createError({ statusCode: 404, message: 'Brouillon introuvable.' })
    const draft = CvDraftOutput.safeParse(generation.output)
    if (!draft.success)
      throw createError({ statusCode: 400, message: 'Ce brouillon est illisible.' })
    content = draftToContent(draft.data)
    profileId ??= generation.inputRefs.profileId
    revisionLabel =
      generation.inputRefs.cvMode === 'interview'
        ? 'Brouillon de l’entretien'
        : 'Import depuis ton CV'
  }

  // The template's recommended section order (« Étudiant »: education first), at creation only.
  content = applyTemplateSectionOrder(content, cvTemplates[body.templateId ?? 'sobre'])

  const row = await createCvDocument(user.id, {
    profileId,
    title: body.title ?? DEFAULT_CV_TITLE,
    templateId: body.templateId,
    content,
    revisionLabel,
    generationId: body.fromGenerationId,
  })
  setResponseStatus(event, 201)
  return toCvDocument(row)
})
