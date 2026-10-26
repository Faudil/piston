import { and, cvDocumentRevisions, desc, eq, inArray, type CvDocumentRevisionRow } from '@piston/db'
import type {
  CvContent,
  CvDesign,
  CvRevision,
  CvRevisionSource,
  CvTemplateId,
} from '@piston/shared'

/**
 * Revision history of CV documents: every manual save, Claude edit and
 * restore leaves a revision, and autosaves leave periodic checkpoints.
 * updateCvDocument (cv-documents.ts) is the only writer.
 */

/** Revisions kept per document; older ones are deleted. */
export const MAX_CV_REVISIONS = 50

/** Autosaves create a checkpoint revision when the last one is older than this. */
export const CV_CHECKPOINT_INTERVAL_MS = 15 * 60 * 1000

function toCvRevision(
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

/** JSON with sorted keys, so two equal states compare equal whatever their key order (jsonb reorders keys). */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export interface CvState {
  templateId: CvTemplateId
  content: CvContent
  design: CvDesign
}

export const sameCvState = (a: CvState, b: CvState) =>
  stableStringify({ t: a.templateId, c: a.content, d: a.design }) ===
  stableStringify({ t: b.templateId, c: b.content, d: b.design })

export type CvTx = Parameters<Parameters<ReturnType<typeof useDb>['transaction']>[0]>[0]

export async function insertCvRevision(
  tx: CvTx,
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
export async function pruneCvRevisions(tx: CvTx, documentId: string) {
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
