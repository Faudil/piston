import { beforeEach, describe, expect, it } from 'vitest'
import { cvDocumentAssets, cvDocumentRevisions, cvDocuments, eq } from '@piston/db'
import { CV_ASSET_MAX_BYTES, type CvDocument } from '@piston/shared'
import getRoute from '../../server/api/cv-documents/[id].get'
import patchRoute from '../../server/api/cv-documents/[id].patch'
import pdfRoute from '../../server/api/cv-documents/[id]/pdf.get'
import duplicateRoute from '../../server/api/cv-documents/[id]/duplicate.post'
import { buildAccountExport } from '../../server/utils/account'
import { getCvAsset, saveCvAsset, sniffImage } from '../../server/utils/cv-assets'
import { extractPdfText } from '../../server/utils/pdf'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

/** A 2×2 PNG. */
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
  ),
  (char) => char.charCodeAt(0),
)

/** The header of a 640×480 baseline JPEG: SOI, APP0 (JFIF), SOF0. */
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0x01, 0x22,
  0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
])

/** The header of a 800×600 extended WebP (VP8X). */
const WEBP = new Uint8Array([
  ...'RIFF'.split('').map((c) => c.charCodeAt(0)),
  0x24,
  0,
  0,
  0,
  ...'WEBPVP8X'.split('').map((c) => c.charCodeAt(0)),
  0x0a,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0x1f,
  0x03,
  0x00,
  0x57,
  0x02,
  0x00,
  0,
  0,
])

/** A document exactly as the v1 builder stored it. */
const v1Content = {
  header: {
    fullName: 'Élodie Lefèvre',
    title: 'Chargée de communication',
    email: 'elodie@example.com',
    phone: '',
    city: 'Besançon',
    links: [],
  },
  summary: 'Cinq ans de communication culturelle.',
  experiences: [],
  education: [],
  skills: [{ id: 's1', name: 'Outils', items: ['Canva', 'WordPress'] }],
  languages: [{ id: 'g1', name: 'Anglais', level: 'C1' }],
  projects: [],
  certifications: [],
  interests: [],
  sections: [
    { key: 'summary', title: '', visible: true },
    { key: 'skills', title: '', visible: true },
    { key: 'languages', title: '', visible: true },
    { key: 'experiences', title: '', visible: true },
    { key: 'education', title: '', visible: true },
    { key: 'projects', title: '', visible: false },
    { key: 'certifications', title: '', visible: false },
    { key: 'interests', title: '', visible: false },
  ],
}
const v1Design = { accentColor: '#1d4ed8', font: 'lato', density: 'compact', language: 'fr' }

async function insertV1Document(userId: string, profileId: string) {
  const [row] = await testState.db
    .insert(cvDocuments)
    .values({
      userId,
      profileId,
      title: 'Mon CV v1',
      templateId: 'moderne',
      content: v1Content as never,
      design: v1Design as never,
    })
    .returning()
  await testState.db.insert(cvDocumentRevisions).values({
    documentId: row!.id,
    userId,
    label: 'Création',
    source: 'created',
    templateId: 'moderne',
    content: v1Content as never,
    design: v1Design as never,
  })
  return row!
}

const onDocument = (
  handler: Parameters<typeof callRoute>[0],
  id: string,
  options: { method?: string; suffix?: string; body?: unknown } = {},
) =>
  callRoute(handler, {
    method: options.method ?? 'GET',
    path: `/api/cv-documents/${id}${options.suffix ?? ''}`,
    route: `/api/cv-documents/:id${options.suffix ?? ''}`,
    body: options.body,
  })

describe('stored v1 documents', () => {
  it('are upgraded on read and rewritten as v2 on the next save', async () => {
    const { user, profile } = await loginAsNewUser()
    const row = await insertV1Document(user.id, profile.id)

    const res = await onDocument(getRoute, row.id)
    expect(res.status).toBe(200)
    const document = (await res.json()) as CvDocument
    expect(document.content.version).toBe(2)
    expect(document.content.skills[0]!.items.map((skill) => skill.name)).toEqual([
      'Canva',
      'WordPress',
    ])
    expect(document.content.languages[0]!.cefr).toBe('C1')
    expect(document.content.sections.slice(0, 3).map((section) => section.key)).toEqual([
      'summary',
      'skills',
      'languages',
    ])
    expect(document.design).toMatchObject({
      version: 2,
      palette: { primary: '#1d4ed8' },
      fontPairing: 'lato',
      spacing: 'compact',
    })

    // Still v1 in the database until it is saved.
    const [stored] = await testState.db.select().from(cvDocuments).where(eq(cvDocuments.id, row.id))
    expect((stored!.content as { version?: number }).version).toBeUndefined()

    const saved = await onDocument(patchRoute, row.id, {
      method: 'PATCH',
      body: { title: 'Renommé', baseUpdatedAt: document.updatedAt, snapshot: { label: 'Test' } },
    })
    expect(saved.status).toBe(200)
    const [rewritten] = await testState.db
      .select()
      .from(cvDocuments)
      .where(eq(cvDocuments.id, row.id))
    expect(rewritten!.content.version).toBe(2)
    expect(rewritten!.design.version).toBe(2)
    // The v1 « Création » revision equals the upgraded document: no « Modifications manuelles ».
    const revisions = await testState.db
      .select()
      .from(cvDocumentRevisions)
      .where(eq(cvDocumentRevisions.documentId, row.id))
    expect(revisions.map((revision) => revision.label).sort()).toEqual(['Création', 'Test'])
  })

  it('render to PDF with the new renderer', async () => {
    const { user, profile } = await loginAsNewUser()
    const row = await insertV1Document(user.id, profile.id)
    const res = await onDocument(pdfRoute, row.id, { suffix: '/pdf' })
    expect(res.status).toBe(200)
    const text = await extractPdfText(new Uint8Array(await res.arrayBuffer()))
    expect(text.indexOf('Élodie Lefèvre')).toBe(0)
    expect(text).toContain('Canva · WordPress')
  })
})

describe('CV assets', () => {
  it('sniffs PNG, JPEG and WebP from their bytes, nothing else', () => {
    expect(sniffImage(PNG)).toEqual({ mimeType: 'image/png', width: 2, height: 2 })
    expect(sniffImage(JPEG)).toEqual({ mimeType: 'image/jpeg', width: 640, height: 480 })
    expect(sniffImage(WEBP)).toEqual({ mimeType: 'image/webp', width: 800, height: 600 })
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(
      null,
    )
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0x00]))).toBeNull()
    expect(sniffImage(new Uint8Array(0))).toBeNull()
  })

  it('stores an image for the user’s own document, within the size limit', async () => {
    const { user, profile } = await loginAsNewUser('alice@example.com')
    const row = await insertV1Document(user.id, profile.id)
    const asset = await saveCvAsset(user.id, row.id, PNG)
    expect(asset).toMatchObject({ documentId: row.id, mimeType: 'image/png', size: PNG.length })
    expect((await getCvAsset(user.id, row.id, asset.id))?.bytes).toBeTruthy()

    await expect(
      saveCvAsset(user.id, row.id, new TextEncoder().encode('%PDF-1.7')),
    ).rejects.toMatchObject({
      statusCode: 400,
    })
    const big = new Uint8Array(CV_ASSET_MAX_BYTES + 1)
    big.set(PNG)
    await expect(saveCvAsset(user.id, row.id, big)).rejects.toMatchObject({ statusCode: 413 })

    const bob = await loginAsNewUser('bob@example.com')
    await expect(saveCvAsset(bob.user.id, row.id, PNG)).rejects.toMatchObject({ statusCode: 404 })
    expect(await getCvAsset(bob.user.id, row.id, asset.id)).toBeNull()
  })

  it('draws the photo, copies it with the document, deletes it with the document', async () => {
    const { user, profile } = await loginAsNewUser()
    const row = await insertV1Document(user.id, profile.id)
    const asset = await saveCvAsset(user.id, row.id, PNG)
    const document = (await (await onDocument(getRoute, row.id)).json()) as CvDocument
    const content = {
      ...document.content,
      header: {
        ...document.content.header,
        photo: { assetId: asset.id, shape: 'round', size: 'm', position: 'left', visible: true },
      },
    }
    const saved = await onDocument(patchRoute, row.id, { method: 'PATCH', body: { content } })
    expect(saved.status).toBe(200)

    const pdf = Buffer.from(
      await (await onDocument(pdfRoute, row.id, { suffix: '/pdf' })).arrayBuffer(),
    )
    expect(pdf.toString('latin1')).toMatch(/\/Subtype \/Image/)

    const copyRes = await onDocument(duplicateRoute, row.id, {
      method: 'POST',
      suffix: '/duplicate',
      body: {},
    })
    const copy = (await copyRes.json()) as CvDocument
    const copyPhoto = copy.content.header.photo!
    expect(copyPhoto.assetId).not.toBe(asset.id)
    expect((await getCvAsset(user.id, copy.id, copyPhoto.assetId))?.mimeType).toBe('image/png')

    const exported = await buildAccountExport(user.id)
    expect(exported.cvDocumentAssets).toHaveLength(2)
    expect(exported.cvDocumentAssets[0]).toMatchObject({ mimeType: 'image/png', size: PNG.length })
    expect('bytes' in exported.cvDocumentAssets[0]!).toBe(false)

    await testState.db.delete(cvDocuments).where(eq(cvDocuments.id, row.id))
    const left = await testState.db.select().from(cvDocumentAssets)
    expect(left.map((entry) => entry.documentId)).toEqual([copy.id])
  })
})
