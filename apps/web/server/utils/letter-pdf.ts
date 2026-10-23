import { renderLetterPdf, formatLetterDate } from '@piston/cv-render'
import { and, cvDocuments, desc, eq, generations, jobOffers, users } from '@piston/db'
import { CvDesign, createBlankCv } from '@piston/shared'

/**
 * « Lettre assortie »: a saved cover letter as a PDF in the look of one of
 * the user's CV documents (same header, palette, fonts, margins).
 */

/** The letter's PDF and its file name. */
export async function renderMatchingLetter(
  userId: string,
  generationId: string,
  cvDocumentId?: string,
): Promise<{ pdf: Uint8Array; filename: string }> {
  const db = useDb()
  const generation = await db.query.generations.findFirst({
    where: and(eq(generations.id, generationId), eq(generations.userId, userId)),
  })
  if (!generation || generation.kind !== 'cover_letter') {
    throw createError({ statusCode: 404, message: 'Lettre introuvable.' })
  }
  const output = generation.output as { paragraphs?: string[] }
  const paragraphs = output.paragraphs ?? []

  const offerId = generation.inputRefs.offerId
  const offer = offerId
    ? await db.query.jobOffers.findFirst({
        where: and(eq(jobOffers.id, offerId), eq(jobOffers.userId, userId)),
      })
    : undefined

  // The chosen CV (404 when it is not the user's), else the latest one of the
  // offer's profile, else a neutral look with the account's name.
  let document = cvDocumentId ? await getUserCvDocument(userId, cvDocumentId) : undefined
  const profileId = offer?.profileId ?? generation.inputRefs.profileId
  if (!document && profileId) {
    const [row] = await db
      .select({ id: cvDocuments.id })
      .from(cvDocuments)
      .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.profileId, profileId)))
      .orderBy(desc(cvDocuments.updatedAt))
      .limit(1)
    if (row) document = await getUserCvDocument(userId, row.id)
  }

  let content, design, templateId, assets
  if (document) {
    ;({ content, design, templateId } = document)
    assets = await loadCvRenderAssets(userId, document.id, content)
  } else {
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    content = createBlankCv(user?.displayName ?? '')
    design = CvDesign.parse({ version: 2 })
    templateId = 'sobre' as const
    assets = {}
  }

  const pdf = await withCvPdfEngine('letter', (engine) =>
    renderLetterPdf(
      {
        content,
        design,
        templateId,
        paragraphs,
        recipient: { company: offer?.company ?? '' },
        dateLine: formatLetterDate(new Date(), design.language, content.header.city),
      },
      assets,
      engine,
    ),
  )
  const name = content.header.fullName.trim()
  const company = offer?.company.trim()
  return {
    pdf,
    filename: ['Lettre de motivation', company, name].filter(Boolean).join(' - ') + '.pdf',
  }
}
