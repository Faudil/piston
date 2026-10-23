import {
  and,
  cvDocumentAssets,
  cvDocumentRevisions,
  cvDocuments,
  desc,
  eq,
  inArray,
  jobOffers,
  type CvDocumentRevisionRow,
  type CvDocumentRow,
} from '@piston/db'
import {
  CvDesign,
  LIMITS,
  cvToText,
  upgradeCvDocument,
  type CvContent,
  type CvDocument,
  type CvDocumentSummary,
  type CvRevision,
  type CvRevisionSource,
  type CvTemplateId,
  type UpdateCvDocumentBody,
} from '@piston/shared'

/** Revisions kept per document; older ones are deleted. */
export const MAX_CV_REVISIONS = 50

/** Autosaves create a checkpoint revision when the last one is older than this. */
export const CV_CHECKPOINT_INTERVAL_MS = 15 * 60 * 1000

export const DEFAULT_CV_TITLE = 'Mon CV'

function notFound() {
  return createError({ statusCode: 404, message: 'CV introuvable.' })
}

/**
 * A stored row with its content and design upgraded to the current schema
 * (v1 documents not saved since v2 are still v1 in the database). Every
 * read goes through this; the next save writes the upgraded JSON back.
 */
export function readCvRow<T extends Pick<CvDocumentRow, 'content' | 'design'>>(row: T): T {
  return { ...row, ...upgradeCvDocument(row) }
}

export function toCvDocument(row: CvDocumentRow): CvDocument {
  row = readCvRow(row)
  return {
    id: row.id,
    profileId: row.profileId,
    offerId: row.offerId,
    title: row.title,
    templateId: row.templateId,
    content: row.content,
    design: row.design,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toCvRevision(
  row: Pick<
    CvDocumentRevisionRow,
    'id' | 'label' | 'source' | 'generationId' | 'templateId' | 'createdAt'
  >,
): CvRevision {
  return {
    id: row.id,
    label: row.label,
    source: row.source,
    generationId: row.generationId,
    templateId: row.templateId,
    createdAt: row.createdAt.toISOString(),
  }
}

/** One of the user's CV documents, or a 404 (also for other users' documents). */
export async function getUserCvDocument(userId: string, documentId: string) {
  const [row] = await useDb()
    .select()
    .from(cvDocuments)
    .where(and(eq(cvDocuments.id, documentId), eq(cvDocuments.userId, userId)))
  if (!row) throw notFound()
  return readCvRow(row)
}

/** The user's documents, most recently edited first, optionally for one profile. */
export async function listCvDocuments(
  userId: string,
  profileId?: string,
): Promise<CvDocumentSummary[]> {
  const rows = await useDb()
    .select({
      id: cvDocuments.id,
      profileId: cvDocuments.profileId,
      title: cvDocuments.title,
      templateId: cvDocuments.templateId,
      content: cvDocuments.content,
      createdAt: cvDocuments.createdAt,
      updatedAt: cvDocuments.updatedAt,
      offerId: jobOffers.id,
      offerTitle: jobOffers.title,
      offerCompany: jobOffers.company,
    })
    .from(cvDocuments)
    .leftJoin(jobOffers, eq(jobOffers.id, cvDocuments.offerId))
    .where(
      and(
        eq(cvDocuments.userId, userId),
        profileId ? eq(cvDocuments.profileId, profileId) : undefined,
      ),
    )
    .orderBy(desc(cvDocuments.updatedAt))
  return rows.map((row) => ({
    id: row.id,
    profileId: row.profileId,
    title: row.title,
    templateId: row.templateId,
    fullName: row.content.header?.fullName ?? '',
    offer: row.offerId
      ? { id: row.offerId, title: row.offerTitle ?? '', company: row.offerCompany ?? '' }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

/** JSON with sorted keys, so two equal states compare equal whatever their key order (jsonb reorders keys). */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

interface CvState {
  templateId: CvTemplateId
  content: CvContent
  design: CvDesign
}

const sameState = (a: CvState, b: CvState) =>
  stableStringify({ t: a.templateId, c: a.content, d: a.design }) ===
  stableStringify({ t: b.templateId, c: b.content, d: b.design })

type Tx = Parameters<Parameters<ReturnType<typeof useDb>['transaction']>[0]>[0]

async function insertRevision(
  tx: Tx,
  documentId: string,
  userId: string,
  state: CvState,
  meta: { label: string; source: CvRevisionSource; generationId?: string | null },
) {
  await tx.insert(cvDocumentRevisions).values({
    documentId,
    userId,
    label: meta.label,
    source: meta.source,
    generationId: meta.generationId ?? null,
    templateId: state.templateId,
    content: state.content,
    design: state.design,
  })
}

/** Deletes the oldest revisions beyond MAX_CV_REVISIONS. */
async function pruneRevisions(tx: Tx, documentId: string) {
  const old = await tx
    .select({ id: cvDocumentRevisions.id })
    .from(cvDocumentRevisions)
    .where(eq(cvDocumentRevisions.documentId, documentId))
    .orderBy(desc(cvDocumentRevisions.seq))
    .offset(MAX_CV_REVISIONS)
  if (old.length) {
    await tx.delete(cvDocumentRevisions).where(
      inArray(
        cvDocumentRevisions.id,
        old.map((row) => row.id),
      ),
    )
  }
}

/**
 * Creates a document in a profile (the default one, created as « Principal »
 * if the user has none) with its first revision.
 */
export async function createCvDocument(
  userId: string,
  input: {
    profileId?: string
    offerId?: string | null
    title: string
    templateId: CvTemplateId
    content: CvContent
    design?: CvDesign
    revisionLabel: string
    generationId?: string
  },
) {
  return useDb().transaction(async (tx) => {
    const profile = await resolveProfileForNewResume(tx, userId, input.profileId)
    const state: CvState = {
      templateId: input.templateId,
      content: input.content,
      design: input.design ?? CvDesign.parse({}),
    }
    const [row] = await tx
      .insert(cvDocuments)
      .values({
        userId,
        profileId: profile.id,
        offerId: input.offerId ?? null,
        title: input.title,
        ...state,
      })
      .returning()
    await insertRevision(tx, row!.id, userId, state, {
      label: input.revisionLabel,
      source: 'created',
      generationId: input.generationId,
    })
    return row!
  })
}

/**
 * Saves changes to a document (autosave or explicit change).
 *
 * - Refuses with a 409 when `baseUpdatedAt` is not the stored `updatedAt`:
 *   the document changed elsewhere (another tab) since the client loaded it.
 * - With `snapshot`, records a revision of the new state; if the document had
 *   unsaved-in-history changes before it, records them first (« Modifications
 *   manuelles »), so restoring the state before an AI change keeps the typing
 *   done before it.
 * - Without, records a checkpoint when the last revision is older than
 *   CV_CHECKPOINT_INTERVAL_MS, so long manual sessions leave restore points.
 */
export async function updateCvDocument(
  userId: string,
  documentId: string,
  // Restorations record their own source, which clients cannot send.
  body: Omit<UpdateCvDocumentBody, 'snapshot'> & {
    snapshot?: { label: string; source: CvRevisionSource; generationId?: string }
  },
) {
  return useDb().transaction(async (tx) => {
    const [found] = await tx
      .select()
      .from(cvDocuments)
      .where(and(eq(cvDocuments.id, documentId), eq(cvDocuments.userId, userId)))
      .for('update')
    if (!found) throw notFound()
    const current = readCvRow(found)
    if (body.baseUpdatedAt && current.updatedAt.toISOString() !== body.baseUpdatedAt) {
      throw createError({
        statusCode: 409,
        message:
          'Ce CV a été modifié ailleurs (dans un autre onglet ?). Recharge la page pour voir la dernière version.',
      })
    }
    if (body.snapshot?.generationId)
      await getUserGenerationId(tx, userId, body.snapshot.generationId)

    const before: CvState = {
      templateId: current.templateId,
      content: current.content,
      design: current.design,
    }
    const after: CvState = {
      templateId: body.templateId ?? current.templateId,
      content: body.content ?? current.content,
      design: body.design ?? current.design,
    }

    const [row] = await tx
      .update(cvDocuments)
      .set({
        title: body.title ?? current.title,
        templateId: after.templateId,
        content: after.content,
        design: after.design,
      })
      .where(eq(cvDocuments.id, current.id))
      .returning()

    const [latestRow] = await tx
      .select()
      .from(cvDocumentRevisions)
      .where(eq(cvDocumentRevisions.documentId, current.id))
      .orderBy(desc(cvDocumentRevisions.seq))
      .limit(1)
    // Compared once upgraded: a v1 revision equal to the upgraded document is the same state.
    const latest = latestRow && readCvRow(latestRow)

    if (body.snapshot) {
      if (latest && !sameState(latest, before)) {
        await insertRevision(tx, current.id, userId, before, {
          label: 'Modifications manuelles',
          source: 'manual',
        })
      }
      await insertRevision(tx, current.id, userId, after, body.snapshot)
    } else if (
      !sameState(before, after) &&
      (!latest || Date.now() - latest.createdAt.getTime() > CV_CHECKPOINT_INTERVAL_MS)
    ) {
      await insertRevision(tx, current.id, userId, after, {
        label: 'Modifications',
        source: 'manual',
      })
    }
    await pruneRevisions(tx, current.id)
    return row!
  })
}

/** Throws a 404 unless the generation is the user's. */
async function getUserGenerationId(tx: Tx, userId: string, generationId: string) {
  const found = await tx.query.generations.findFirst({
    columns: { id: true },
    where: (g, { and: all, eq: equals }) =>
      all(equals(g.id, generationId), equals(g.userId, userId)),
  })
  if (!found) throw createError({ statusCode: 404, message: 'Génération introuvable.' })
}

/** The revisions of one of the user's documents, newest first (without their content). */
export async function listCvRevisions(userId: string, documentId: string): Promise<CvRevision[]> {
  await getUserCvDocument(userId, documentId)
  const rows = await useDb()
    .select({
      id: cvDocumentRevisions.id,
      createdAt: cvDocumentRevisions.createdAt,
      documentId: cvDocumentRevisions.documentId,
      userId: cvDocumentRevisions.userId,
      label: cvDocumentRevisions.label,
      source: cvDocumentRevisions.source,
      generationId: cvDocumentRevisions.generationId,
      templateId: cvDocumentRevisions.templateId,
    })
    .from(cvDocumentRevisions)
    .where(eq(cvDocumentRevisions.documentId, documentId))
    .orderBy(desc(cvDocumentRevisions.seq))
  return rows.map(toCvRevision)
}

/** Puts a revision's state back into the document, as a new « Restauration » revision. */
export async function restoreCvRevision(userId: string, documentId: string, revisionId: string) {
  const document = await getUserCvDocument(userId, documentId)
  const [revision] = await useDb()
    .select()
    .from(cvDocumentRevisions)
    .where(
      and(eq(cvDocumentRevisions.id, revisionId), eq(cvDocumentRevisions.documentId, document.id)),
    )
  if (!revision)
    throw createError({ statusCode: 404, message: 'Version de l’historique introuvable.' })
  const restored = readCvRow(revision)

  const date = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(revision.createdAt)
  return updateCvDocument(userId, documentId, {
    templateId: restored.templateId,
    content: restored.content,
    design: restored.design,
    snapshot: { label: `Restauration : ${revision.label} (${date})`, source: 'restore' },
  })
}

/** Copies a document (its current state, not its history), optionally dedicated to an offer. */
export async function duplicateCvDocument(
  userId: string,
  documentId: string,
  input: { title?: string; offerId?: string },
) {
  const source = await getUserCvDocument(userId, documentId)
  const offer = input.offerId ? await getUserOffer(userId, input.offerId) : null
  const title =
    input.title ??
    (offer ? `${source.title} — ${offer.title}` : `${source.title} (copie)`).slice(0, 120)
  const copy = await createCvDocument(userId, {
    profileId: source.profileId,
    offerId: offer?.id ?? source.offerId,
    title,
    templateId: source.templateId,
    content: source.content,
    design: source.design,
    revisionLabel: `Copie de « ${source.title} »`,
  })
  return copyCvPhoto(userId, source.id, copy)
}

/**
 * Assets belong to one document: a copy gets its own copy of the photo, and
 * its content points at it (the copy's first revision keeps the source's
 * reference, which restoring would simply render without a photo).
 */
async function copyCvPhoto(userId: string, sourceId: string, copy: CvDocumentRow) {
  const content = readCvRow(copy).content
  const photo = content.header.photo
  if (!photo) return copy
  const asset = await getCvAsset(userId, sourceId, photo.assetId)
  if (!asset) return copy
  const [duplicate] = await useDb()
    .insert(cvDocumentAssets)
    .values({
      documentId: copy.id,
      userId,
      mimeType: asset.mimeType,
      bytes: asset.bytes,
      width: asset.width,
      height: asset.height,
    })
    .returning({ id: cvDocumentAssets.id })
  const [updated] = await useDb()
    .update(cvDocuments)
    .set({
      content: {
        ...content,
        header: { ...content.header, photo: { ...photo, assetId: duplicate!.id } },
      },
    })
    .where(eq(cvDocuments.id, copy.id))
    .returning()
  return updated!
}

export async function deleteCvDocument(userId: string, documentId: string) {
  const [deleted] = await useDb()
    .delete(cvDocuments)
    .where(and(eq(cvDocuments.id, documentId), eq(cvDocuments.userId, userId)))
    .returning({ id: cvDocuments.id })
  if (!deleted) throw notFound()
}

/**
 * « Enregistrer comme version du CV »: renders the PDF and adds it, with its
 * text, as the new current version of the document's profile. The text is
 * extracted from the PDF rather than generated from the document, because it
 * is what an ATS (and the review's ATS evaluation) reads; if the PDF yields no
 * text, the document's plain-text export is used instead.
 */
export async function saveCvDocumentAsVersion(userId: string, documentId: string, title?: string) {
  const document = await getUserCvDocument(userId, documentId)
  const pdf = await renderCvDocumentPdf(userId, document)
  const extracted = await extractPdfText(pdf)
  const rawText = (extracted || cvToText(document.content, document.design)).slice(
    0,
    LIMITS.maxTextLength,
  )
  return createCurrentResume(userId, {
    profileId: document.profileId,
    title: title ?? document.title,
    rawText,
    sourceFilename: cvPdfFilename(document.content, document.title),
    sourcePdf: pdf,
  })
}
