import { randomBytes } from 'node:crypto'
import { and, cvDocuments, cvShareLinks, desc, eq, sql, type CvShareLinkRow } from '@piston/db'
import type { CvShareLink } from '@piston/shared'

/**
 * Share links: a read-only, revocable, unguessable URL to the PDF of a CV
 * document, for people without an account (a recruiter, a friend). The
 * trade-offs are in docs/DECISIONS.md.
 */

/** 32 random bytes (256 bits), base64url: 43 URL-safe characters. */
export function generateShareToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Anything that cannot be a token we issued is rejected before the database. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{32,64}$/

const DAY_MS = 24 * 60 * 60 * 1000

export function toShareLink(row: CvShareLinkRow): CvShareLink {
  return {
    id: row.id,
    token: row.token,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    viewCount: row.viewCount,
  }
}

/** Creates a link for one of the user's documents (404 for anyone else's). */
export async function createShareLink(
  userId: string,
  documentId: string,
  expiresInDays: 7 | 30 | null,
): Promise<CvShareLink> {
  await getUserCvDocument(userId, documentId)
  const [row] = await useDb()
    .insert(cvShareLinks)
    .values({
      documentId,
      userId,
      token: generateShareToken(),
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * DAY_MS) : null,
    })
    .returning()
  return toShareLink(row!)
}

/** The document's links, newest first (revoked ones included, so the owner sees what happened). */
export async function listShareLinks(userId: string, documentId: string): Promise<CvShareLink[]> {
  await getUserCvDocument(userId, documentId)
  const rows = await useDb()
    .select()
    .from(cvShareLinks)
    .where(and(eq(cvShareLinks.documentId, documentId), eq(cvShareLinks.userId, userId)))
    .orderBy(desc(cvShareLinks.createdAt))
  return rows.map(toShareLink)
}

/** Revokes a link of the user's document. Idempotent; the row stays, with its views. */
export async function revokeShareLink(userId: string, documentId: string, linkId: string) {
  const [row] = await useDb()
    .update(cvShareLinks)
    .set({ revokedAt: sql`coalesce(${cvShareLinks.revokedAt}, now())` })
    .where(
      and(
        eq(cvShareLinks.id, linkId),
        eq(cvShareLinks.documentId, documentId),
        eq(cvShareLinks.userId, userId),
      ),
    )
    .returning()
  if (!row) throw createError({ statusCode: 404, message: 'Lien introuvable.' })
  return toShareLink(row)
}

/**
 * The live link behind a public token and its document: 404 for an unknown
 * token, 410 for a revoked or expired one (French messages, shown by the page).
 */
export async function resolveShareLink(token: string) {
  const unknown = createError({ statusCode: 404, message: "Ce lien de partage n'existe pas." })
  if (!TOKEN_FORMAT.test(token)) throw unknown
  const [row] = await useDb()
    .select({ link: cvShareLinks, document: cvDocuments })
    .from(cvShareLinks)
    .innerJoin(cvDocuments, eq(cvDocuments.id, cvShareLinks.documentId))
    .where(eq(cvShareLinks.token, token))
  if (!row) throw unknown
  if (row.link.revokedAt) {
    throw createError({ statusCode: 410, message: 'Ce lien de partage a été désactivé.' })
  }
  if (row.link.expiresAt && row.link.expiresAt.getTime() <= Date.now()) {
    throw createError({ statusCode: 410, message: 'Ce lien de partage a expiré.' })
  }
  return { link: row.link, document: readCvRow(row.document) }
}

/** Counts one view of a link. */
export async function recordShareView(linkId: string) {
  await useDb()
    .update(cvShareLinks)
    .set({ viewCount: sql`${cvShareLinks.viewCount} + 1` })
    .where(eq(cvShareLinks.id, linkId))
}

/** Public PDF requests allowed per token and minute. */
const VIEWS_PER_MINUTE = 20
const WINDOW_MS = 60_000
const viewsByToken = new Map<string, number[]>()

/**
 * Caps how often one link can render a PDF (a leaked link must not become a
 * way to burn the server's CPU). In memory, per process, like web-limit.ts.
 */
export function consumeShareView(token: string, now = Date.now()) {
  const recent = (viewsByToken.get(token) ?? []).filter((time) => now - time < WINDOW_MS)
  if (recent.length >= VIEWS_PER_MINUTE) {
    viewsByToken.set(token, recent)
    throw createError({
      statusCode: 429,
      message: 'Trop de consultations de ce lien. Réessaie dans une minute.',
    })
  }
  recent.push(now)
  viewsByToken.set(token, recent)
  // Keep the map small: forget tokens that have been quiet for a window.
  if (viewsByToken.size > 500) {
    for (const [key, times] of viewsByToken) {
      if (times.every((time) => now - time >= WINDOW_MS)) viewsByToken.delete(key)
    }
  }
}

/** Forgets every counter. Used by tests. */
export function resetShareViews() {
  viewsByToken.clear()
}
