import { beforeEach, describe, expect, it } from 'vitest'
import { cvDocuments } from '@piston/db'
import { CV_ASSET_MAX_BYTES, createBlankCv, type CvAsset } from '@piston/shared'
import photoPost from '../../server/api/cv-documents/[id]/photo.post'
import photoGet from '../../server/api/cv-documents/[id]/photo.get'
import photoDelete from '../../server/api/cv-documents/[id]/photo.delete'
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

/** An 800×600 extended WebP header (a valid WebP, not accepted for photos). */
const WEBP = new Uint8Array([
  ...[...'RIFF'].map((c) => c.charCodeAt(0)),
  0x24,
  0,
  0,
  0,
  ...[...'WEBPVP8X'].map((c) => c.charCodeAt(0)),
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

async function insertDocument(userId: string, profileId: string) {
  const [row] = await testState.db
    .insert(cvDocuments)
    .values({
      userId,
      profileId,
      title: 'Mon CV',
      templateId: 'moderne',
      content: createBlankCv('Camille') as never,
      design: {} as never,
    })
    .returning()
  return row!
}

function upload(documentId: string, bytes: Uint8Array, filename = 'photo.jpg') {
  const form = new FormData()
  form.append('file', new Blob([bytes]), filename)
  return callRoute(photoPost, {
    method: 'POST',
    path: `/api/cv-documents/${documentId}/photo`,
    route: '/api/cv-documents/:id/photo',
    body: form,
  })
}

const call = (
  handler: Parameters<typeof callRoute>[0],
  documentId: string,
  method: string,
  headers = {},
) =>
  callRoute(handler, {
    method,
    path: `/api/cv-documents/${documentId}/photo`,
    route: '/api/cv-documents/:id/photo',
    headers,
  })

describe('CV photo routes', () => {
  it('stores a JPEG, serves its bytes privately, and replaces the previous photo', async () => {
    const { user, profile } = await loginAsNewUser()
    const document = await insertDocument(user.id, profile.id)

    expect((await call(photoGet, document.id, 'GET')).status).toBe(404)

    const first = await upload(document.id, JPEG)
    expect(first.status).toBe(201)
    const firstAsset = (await first.json()) as CvAsset
    expect(firstAsset).toMatchObject({ mimeType: 'image/jpeg', width: 640, height: 480 })

    const served = await call(photoGet, document.id, 'GET')
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/jpeg')
    expect(served.headers.get('cache-control')).toContain('private')
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(JPEG)

    const revalidated = await call(photoGet, document.id, 'GET', {
      'if-none-match': served.headers.get('etag')!,
    })
    expect(revalidated.status).toBe(304)

    const second = (await (await upload(document.id, PNG, 'photo.png')).json()) as CvAsset
    expect(second.id).not.toBe(firstAsset.id)
    const rows = await testState.db.query.cvDocumentAssets.findMany()
    expect(rows.map((row) => row.id)).toEqual([second.id])
    const replaced = await call(photoGet, document.id, 'GET')
    expect(replaced.headers.get('content-type')).toBe('image/png')
  })

  it('refuses what is not a JPEG or PNG image, whatever the file name says', async () => {
    const { user, profile } = await loginAsNewUser()
    const document = await insertDocument(user.id, profile.id)
    const text = await upload(document.id, new TextEncoder().encode('%PDF-1.7 hello'), 'photo.jpg')
    expect(text.status).toBe(400)
    expect((await text.json()).message).toContain('PNG, JPEG')
    const svg = await upload(
      document.id,
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      'photo.png',
    )
    expect(svg.status).toBe(400)
    const webp = await upload(document.id, WEBP, 'photo.webp')
    expect(webp.status).toBe(400)
    expect((await webp.json()).message).toContain('WebP')
    expect(await testState.db.query.cvDocumentAssets.findMany()).toHaveLength(0)
  })

  it('refuses a missing file and an image over 2 MB, and keeps the previous photo', async () => {
    const { user, profile } = await loginAsNewUser()
    const document = await insertDocument(user.id, profile.id)
    const kept = (await (await upload(document.id, JPEG)).json()) as CvAsset

    const empty = await callRoute(photoPost, {
      method: 'POST',
      path: `/api/cv-documents/${document.id}/photo`,
      route: '/api/cv-documents/:id/photo',
      body: new FormData(),
    })
    expect(empty.status).toBe(400)

    const big = new Uint8Array(CV_ASSET_MAX_BYTES + 1)
    big.set(JPEG)
    expect((await upload(document.id, big)).status).toBe(413)

    const rows = await testState.db.query.cvDocumentAssets.findMany()
    expect(rows.map((row) => row.id)).toEqual([kept.id])
  })

  it('deletes the photo', async () => {
    const { user, profile } = await loginAsNewUser()
    const document = await insertDocument(user.id, profile.id)
    await upload(document.id, JPEG)
    expect((await call(photoDelete, document.id, 'DELETE')).status).toBe(200)
    expect((await call(photoGet, document.id, 'GET')).status).toBe(404)
  })

  it('is isolated: another user cannot read, replace or delete a photo', async () => {
    const alice = await loginAsNewUser('alice@example.com')
    const document = await insertDocument(alice.user.id, alice.profile.id)
    const asset = (await (await upload(document.id, JPEG)).json()) as CvAsset

    await loginAsNewUser('bob@example.com')
    expect((await call(photoGet, document.id, 'GET')).status).toBe(404)
    expect((await upload(document.id, PNG, 'x.png')).status).toBe(404)
    expect((await call(photoDelete, document.id, 'DELETE')).status).toBe(404)

    const rows = await testState.db.query.cvDocumentAssets.findMany()
    expect(rows.map((row) => row.id)).toEqual([asset.id])
  })
})
