import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  cvDocumentRevisions,
  cvDocuments,
  generations,
  jobOffers,
  resumeProfiles,
  resumes,
} from '@piston/db'
import type { CvDocument, CvDocumentSummary, CvDraftOutput, CvRevision } from '@piston/shared'
import listRoute from '../../server/api/cv-documents.get'
import createRoute from '../../server/api/cv-documents.post'
import getRoute from '../../server/api/cv-documents/[id].get'
import patchRoute from '../../server/api/cv-documents/[id].patch'
import deleteRoute from '../../server/api/cv-documents/[id].delete'
import duplicateRoute from '../../server/api/cv-documents/[id]/duplicate.post'
import revisionsRoute from '../../server/api/cv-documents/[id]/revisions.get'
import restoreRoute from '../../server/api/cv-documents/[id]/revisions/[revisionId]/restore.post'
import { MAX_CV_REVISIONS } from '../../server/utils/cv-documents'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

const create = (body: unknown = {}) =>
  callRoute(createRoute, { method: 'POST', path: '/api/cv-documents', body })

const onDocument = (
  handler: Parameters<typeof callRoute>[0],
  id: string,
  options: { method?: string; suffix?: string; route?: string; body?: unknown } = {},
) =>
  callRoute(handler, {
    method: options.method ?? 'GET',
    path: `/api/cv-documents/${id}${options.suffix ?? ''}`,
    route: options.route ?? `/api/cv-documents/:id${options.suffix ?? ''}`,
    body: options.body,
  })

async function createDocument(body: unknown = {}) {
  const res = await create(body)
  expect(res.status).toBe(201)
  return (await res.json()) as CvDocument
}

const draft: CvDraftOutput = {
  header: {
    fullName: 'Camille Durand',
    title: 'Chargée de communication',
    email: 'camille@example.com',
    phone: '',
    city: 'Lyon',
    links: [],
  },
  summary: '',
  experiences: [
    {
      title: 'Chargée de communication',
      organization: 'Agence Lumière',
      location: 'Lyon',
      start: '03/2021',
      end: "Aujourd'hui",
      bullets: ['Gestion des réseaux sociaux'],
    },
  ],
  education: [],
  skills: [],
  languages: [],
  projects: [],
  certifications: [],
  interests: [],
}

async function insertDraft(userId: string, profileId?: string) {
  const [row] = await testState.db
    .insert(generations)
    .values({
      userId,
      kind: 'cv_draft',
      inputRefs: { profileId, cvMode: 'import' },
      output: draft,
      model: 'claude-sonnet-5-5',
    })
    .returning()
  return row!
}

describe('POST /api/cv-documents', () => {
  it('creates a blank document in the default profile, with the user’s name and a first revision', async () => {
    const { profile, user } = await loginAsNewUser()
    const document = await createDocument()
    expect(document).toMatchObject({
      profileId: profile.id,
      offerId: null,
      title: 'Mon CV',
      templateId: 'sobre',
      design: { font: 'inter', density: 'normal', language: 'fr' },
    })
    expect(document.content.header.fullName).toBe(user.displayName)
    expect(document.content.sections).toHaveLength(8)

    const revisions = await testState.db.select().from(cvDocumentRevisions)
    expect(revisions).toMatchObject([
      { documentId: document.id, label: 'Création', source: 'created' },
    ])
  })

  it('creates the default profile for a user who has none', async () => {
    await loginAsNewUser()
    await testState.db.delete(resumeProfiles)
    const document = await createDocument({ title: 'CV marketing' })
    const [profile] = await testState.db.select().from(resumeProfiles)
    expect(profile).toMatchObject({ name: 'Principal', isDefault: true })
    expect(document).toMatchObject({ profileId: profile!.id, title: 'CV marketing' })
  })

  it('creates a document from a cv_draft generation, in the generation’s profile', async () => {
    const { user } = await loginAsNewUser()
    const [other] = await testState.db
      .insert(resumeProfiles)
      .values({ userId: user.id, name: 'Marketing' })
      .returning()
    const generation = await insertDraft(user.id, other!.id)

    const document = await createDocument({
      fromGenerationId: generation.id,
      templateId: 'compact',
    })
    expect(document.profileId).toBe(other!.id)
    expect(document.templateId).toBe('compact')
    expect(document.content.experiences[0]).toMatchObject({
      title: 'Chargée de communication',
      bullets: [{ text: 'Gestion des réseaux sociaux' }],
    })
    const [revision] = await testState.db.select().from(cvDocumentRevisions)
    expect(revision).toMatchObject({ label: 'Import depuis ton CV', generationId: generation.id })
  })

  it('refuses another user’s draft, another kind of generation, and another user’s profile', async () => {
    const alice = await loginAsNewUser('alice@example.com')
    const aliceDraft = await insertDraft(alice.user.id)
    const bob = await loginAsNewUser('bob@example.com')
    const [review] = await testState.db
      .insert(generations)
      .values({ userId: bob.user.id, kind: 'resume_review', output: draft as never, model: 'm' })
      .returning()

    expect((await create({ fromGenerationId: aliceDraft.id })).status).toBe(404)
    expect((await create({ fromGenerationId: review!.id })).status).toBe(404)
    const res = await create({ profileId: alice.profile.id })
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ message: 'Profil de CV introuvable.' })
    expect(await testState.db.select().from(cvDocuments)).toHaveLength(0)
  })

  it('requires a session', async () => {
    expect((await create()).status).toBe(401)
  })
})

describe('GET /api/cv-documents', () => {
  it('lists the user’s documents without their content, filtered by profile', async () => {
    const { user } = await loginAsNewUser()
    const [marketing] = await testState.db
      .insert(resumeProfiles)
      .values({ userId: user.id, name: 'Marketing' })
      .returning()
    await createDocument({ title: 'Général' })
    await createDocument({ title: 'Marketing', profileId: marketing!.id })

    const all = (await (
      await callRoute(listRoute, { path: '/api/cv-documents' })
    ).json()) as CvDocumentSummary[]
    expect(all.map((d) => d.title).sort()).toEqual(['Général', 'Marketing'])
    expect(all[0]).not.toHaveProperty('content')
    expect(all[0]!.fullName).toBe('Camille')

    const filtered = (await (
      await callRoute(listRoute, { path: `/api/cv-documents?profileId=${marketing!.id}` })
    ).json()) as CvDocumentSummary[]
    expect(filtered.map((d) => d.title)).toEqual(['Marketing'])
  })

  it('never shows another user’s documents', async () => {
    await loginAsNewUser('alice@example.com')
    await createDocument()
    await loginAsNewUser('bob@example.com')
    const res = await callRoute(listRoute, { path: '/api/cv-documents' })
    expect(await res.json()).toEqual([])
  })
})

describe('GET and DELETE /api/cv-documents/:id', () => {
  it('returns the document to its owner only', async () => {
    await loginAsNewUser('alice@example.com')
    const document = await createDocument()
    const own = await onDocument(getRoute, document.id)
    expect(((await own.json()) as CvDocument).id).toBe(document.id)

    await loginAsNewUser('bob@example.com')
    const res = await onDocument(getRoute, document.id)
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ message: 'CV introuvable.' })
    expect((await onDocument(deleteRoute, document.id, { method: 'DELETE' })).status).toBe(404)
  })

  it('deletes a document and its history', async () => {
    await loginAsNewUser()
    const document = await createDocument()
    expect((await onDocument(deleteRoute, document.id, { method: 'DELETE' })).status).toBe(200)
    expect(await testState.db.select().from(cvDocuments)).toHaveLength(0)
    expect(await testState.db.select().from(cvDocumentRevisions)).toHaveLength(0)
  })
})

describe('PATCH /api/cv-documents/:id', () => {
  const patch = (id: string, body: unknown) => onDocument(patchRoute, id, { method: 'PATCH', body })

  it('saves content, design, template and title', async () => {
    await loginAsNewUser()
    const document = await createDocument()
    const content = { ...document.content, summary: 'Cinq ans de communication.' }
    const res = await patch(document.id, {
      content,
      design: { ...document.design, accentColor: '#1d4ed8' },
      templateId: 'moderne',
      title: 'CV com',
      baseUpdatedAt: document.updatedAt,
    })
    expect(res.status).toBe(200)
    const saved = (await res.json()) as CvDocument
    expect(saved).toMatchObject({
      title: 'CV com',
      templateId: 'moderne',
      design: { accentColor: '#1d4ed8' },
    })
    expect(saved.content.summary).toBe('Cinq ans de communication.')
    expect(new Date(saved.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(document.updatedAt).getTime(),
    )
  })

  it('validates the document and its limits', async () => {
    await loginAsNewUser()
    const document = await createDocument()
    const res = await patch(document.id, {
      content: { ...document.content, summary: 'x'.repeat(5000) },
    })
    expect(res.status).toBe(400)
    expect((await patch(document.id, {})).status).toBe(400)
    expect((await patch(document.id, { design: { accentColor: 'red' } })).status).toBe(400)
  })

  it('refuses a save based on an outdated version (another tab)', async () => {
    await loginAsNewUser()
    const document = await createDocument()
    const first = await patch(document.id, { title: 'Onglet A', baseUpdatedAt: document.updatedAt })
    expect(first.status).toBe(200)
    // Make sure the stored timestamp moved even on a fast machine.
    await testState.db
      .update(cvDocuments)
      .set({ updatedAt: new Date(Date.now() + 1000) })
      .where(eq(cvDocuments.id, document.id))

    const second = await patch(document.id, {
      title: 'Onglet B',
      baseUpdatedAt: document.updatedAt,
    })
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({
      message: expect.stringContaining('modifié ailleurs'),
    })
  })

  it('does not record a revision for each autosave', async () => {
    await loginAsNewUser()
    const document = await createDocument()
    await patch(document.id, { content: { ...document.content, summary: 'Un' } })
    await patch(document.id, { content: { ...document.content, summary: 'Deux' } })
    expect(await testState.db.select().from(cvDocumentRevisions)).toHaveLength(1)
  })

  it('records a checkpoint when the last revision is old', async () => {
    await loginAsNewUser()
    const document = await createDocument()
    await testState.db
      .update(cvDocumentRevisions)
      .set({ createdAt: new Date(Date.now() - 20 * 60 * 1000) })
    await patch(document.id, { content: { ...document.content, summary: 'Plus tard' } })
    const revisions = await testState.db.select().from(cvDocumentRevisions)
    expect(revisions.map((r) => r.label).sort()).toEqual(['Création', 'Modifications'])
  })

  it('with a snapshot, records the manual changes made before it, then the new state', async () => {
    const { user } = await loginAsNewUser()
    const document = await createDocument()
    await patch(document.id, { content: { ...document.content, summary: 'Tapé à la main' } })
    const [proposal] = await testState.db
      .insert(generations)
      .values({
        userId: user.id,
        kind: 'cv_edit',
        output: { summary: '', operations: [], dropped: 0 },
        model: 'm',
      })
      .returning()

    const res = await patch(document.id, {
      content: { ...document.content, summary: 'Réécrit par Claude' },
      snapshot: { label: 'IA : plus percutant', source: 'ai', generationId: proposal!.id },
    })
    expect(res.status).toBe(200)

    const list = (await (
      await onDocument(revisionsRoute, document.id, { suffix: '/revisions' })
    ).json()) as CvRevision[]
    expect(list.map((r) => [r.label, r.source])).toEqual([
      ['IA : plus percutant', 'ai'],
      ['Modifications manuelles', 'manual'],
      ['Création', 'created'],
    ])
    expect(list[0]!.generationId).toBe(proposal!.id)
    const rows = await testState.db.select().from(cvDocumentRevisions)
    expect(rows.find((r) => r.label === 'Modifications manuelles')!.content.summary).toBe(
      'Tapé à la main',
    )
  })

  it('refuses a snapshot pointing at another user’s generation', async () => {
    const alice = await loginAsNewUser('alice@example.com')
    const [foreign] = await testState.db
      .insert(generations)
      .values({
        userId: alice.user.id,
        kind: 'cv_edit',
        output: { summary: '', operations: [], dropped: 0 },
        model: 'm',
      })
      .returning()
    await loginAsNewUser('bob@example.com')
    const document = await createDocument()
    const res = await patch(document.id, {
      title: 'x',
      snapshot: { label: 'IA', source: 'ai', generationId: foreign!.id },
    })
    expect(res.status).toBe(404)
  })

  it('keeps at most MAX_CV_REVISIONS revisions', async () => {
    await loginAsNewUser()
    const document = await createDocument()
    for (let i = 0; i < MAX_CV_REVISIONS + 3; i++) {
      await patch(document.id, {
        content: { ...document.content, summary: `v${i}` },
        snapshot: { label: `v${i}`, source: 'manual' },
      })
    }
    const rows = await testState.db.select().from(cvDocumentRevisions)
    expect(rows).toHaveLength(MAX_CV_REVISIONS)
    expect(rows.some((r) => r.label === 'Création')).toBe(false)
  })

  it('answers 404 for another user’s document', async () => {
    await loginAsNewUser('alice@example.com')
    const document = await createDocument()
    await loginAsNewUser('bob@example.com')
    expect((await patch(document.id, { title: 'Volé' })).status).toBe(404)
  })
})

describe('POST /api/cv-documents/:id/revisions/:revisionId/restore', () => {
  it('restores a revision and keeps the current state in the history', async () => {
    await loginAsNewUser()
    const document = await createDocument()
    const [created] = await testState.db.select().from(cvDocumentRevisions)
    await onDocument(patchRoute, document.id, {
      method: 'PATCH',
      body: { content: { ...document.content, summary: 'À garder' }, templateId: 'compact' },
    })

    const res = await callRoute(restoreRoute, {
      method: 'POST',
      path: `/api/cv-documents/${document.id}/revisions/${created!.id}/restore`,
      route: '/api/cv-documents/:id/revisions/:revisionId/restore',
    })
    expect(res.status).toBe(200)
    const restored = (await res.json()) as CvDocument
    expect(restored.content.summary).toBe('')
    expect(restored.templateId).toBe('sobre')

    const rows = await testState.db.select().from(cvDocumentRevisions)
    expect(rows.find((r) => r.source === 'restore')!.label).toMatch(/^Restauration : Création/)
    expect(rows.find((r) => r.label === 'Modifications manuelles')!.content.summary).toBe(
      'À garder',
    )
  })

  it('answers 404 for a revision of another document', async () => {
    await loginAsNewUser()
    const a = await createDocument({ title: 'A' })
    const b = await createDocument({ title: 'B' })
    const [revisionOfB] = await testState.db
      .select()
      .from(cvDocumentRevisions)
      .where(eq(cvDocumentRevisions.documentId, b.id))
    const res = await callRoute(restoreRoute, {
      method: 'POST',
      path: `/api/cv-documents/${a.id}/revisions/${revisionOfB!.id}/restore`,
      route: '/api/cv-documents/:id/revisions/:revisionId/restore',
    })
    expect(res.status).toBe(404)
  })
})

describe('POST /api/cv-documents/:id/duplicate', () => {
  it('copies a document, dedicated to an offer', async () => {
    const { user } = await loginAsNewUser()
    const document = await createDocument({ title: 'Général' })
    const [offer] = await testState.db
      .insert(jobOffers)
      .values({ userId: user.id, title: 'Chargée de com', company: 'Acme', rawText: 'Offre' })
      .returning()
    const res = await onDocument(duplicateRoute, document.id, {
      method: 'POST',
      suffix: '/duplicate',
      body: { offerId: offer!.id },
    })
    expect(res.status).toBe(201)
    const copy = (await res.json()) as CvDocument
    expect(copy).toMatchObject({
      title: 'Général — Chargée de com',
      offerId: offer!.id,
      profileId: document.profileId,
    })
    expect(copy.id).not.toBe(document.id)

    const list = (await (
      await callRoute(listRoute, { path: '/api/cv-documents' })
    ).json()) as CvDocumentSummary[]
    expect(list.find((d) => d.id === copy.id)!.offer).toEqual({
      id: offer!.id,
      title: 'Chargée de com',
      company: 'Acme',
    })
  })

  it('refuses another user’s offer', async () => {
    const alice = await loginAsNewUser('alice@example.com')
    const [offer] = await testState.db
      .insert(jobOffers)
      .values({ userId: alice.user.id, title: 'Offre', rawText: 'x' })
      .returning()
    await loginAsNewUser('bob@example.com')
    const document = await createDocument()
    const res = await onDocument(duplicateRoute, document.id, {
      method: 'POST',
      suffix: '/duplicate',
      body: { offerId: offer!.id },
    })
    expect(res.status).toBe(404)
  })
})

describe('profiles and documents', () => {
  it('deleting a profile deletes its documents; resume versions are unaffected by documents', async () => {
    const { profile } = await loginAsNewUser()
    await createDocument()
    await testState.db.delete(resumeProfiles).where(eq(resumeProfiles.id, profile.id))
    expect(await testState.db.select().from(cvDocuments)).toHaveLength(0)
    expect(await testState.db.select().from(resumes)).toHaveLength(0)
  })
})
