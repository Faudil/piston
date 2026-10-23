import JSZip from 'jszip'
import { beforeEach, describe, expect, it } from 'vitest'
import { cvDocuments, cvShareLinks, generations, jobOffers } from '@piston/db'
import type { CvDocument, CvShareLink } from '@piston/shared'
import createDocument from '../../server/api/cv-documents.post'
import patchDocument from '../../server/api/cv-documents/[id].patch'
import docxRoute from '../../server/api/cv-documents/[id]/docx.get'
import listShares from '../../server/api/cv-documents/[id]/share.get'
import createShare from '../../server/api/cv-documents/[id]/share.post'
import revokeShare from '../../server/api/cv-documents/[id]/share/[linkId].delete'
import letterPdfRoute from '../../server/api/generations/[id]/letter-pdf.get'
import infoRoute from '../../server/api/partage/[token]/info.get'
import publicPdf from '../../server/api/partage/[token].get'
import { extractPdfText } from '../../server/utils/pdf'
import { generateShareToken } from '../../server/utils/cv-share'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

async function createFilledDocument(): Promise<CvDocument> {
  const created = await callRoute(createDocument, {
    method: 'POST',
    path: '/api/cv-documents',
    body: {},
  })
  const document = (await created.json()) as CvDocument
  const saved = await callRoute(patchDocument, {
    method: 'PATCH',
    path: `/api/cv-documents/${document.id}`,
    route: '/api/cv-documents/:id',
    body: {
      content: {
        ...document.content,
        header: {
          ...document.content.header,
          fullName: 'Élodie Lefèvre',
          title: 'Chargée de communication',
          email: 'elodie@example.com',
          city: 'Besançon',
        },
        experiences: [
          {
            id: 'e1',
            title: 'Responsable événementiel',
            organization: 'Théâtre du Châtelet',
            location: 'Paris',
            start: '03/2021',
            end: "Aujourd'hui",
            bullets: [{ id: 'b1', text: 'Pilotage de 12 spectacles par saison' }],
          },
        ],
      },
    },
  })
  expect(saved.status).toBe(200)
  return (await saved.json()) as CvDocument
}

const shareCall = (documentId: string, method: 'GET' | 'POST', body?: unknown) =>
  callRoute(method === 'GET' ? listShares : createShare, {
    method,
    path: `/api/cv-documents/${documentId}/share`,
    route: '/api/cv-documents/:id/share',
    body,
  })

const publicCall = (token: string, route = publicPdf, suffix = '') =>
  callRoute(route, {
    path: `/api/partage/${token}${suffix}`,
    route: `/api/partage/:token${suffix}`,
  })

describe('GET /api/cv-documents/:id/docx', () => {
  it('returns a zip whose document.xml holds the name and an experience title', async () => {
    await loginAsNewUser()
    const document = await createFilledDocument()
    const res = await callRoute(docxRoute, {
      path: `/api/cv-documents/${document.id}/docx`,
      route: '/api/cv-documents/:id/docx',
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('wordprocessingml.document')
    expect(res.headers.get('content-disposition')).toContain('.docx')
    const zip = await JSZip.loadAsync(await res.arrayBuffer())
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Élodie Lefèvre')
    expect(xml).toContain('Responsable événementiel')
  })

  it("404s on another user's document", async () => {
    await loginAsNewUser('a@example.com')
    const document = await createFilledDocument()
    await loginAsNewUser('b@example.com')
    const res = await callRoute(docxRoute, {
      path: `/api/cv-documents/${document.id}/docx`,
      route: '/api/cv-documents/:id/docx',
    })
    expect(res.status).toBe(404)
  })
})

describe('share links', () => {
  it('issues unguessable base64url tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateShareToken))
    expect(tokens.size).toBe(200)
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    }
  })

  it('creates, lists and serves the PDF without a session, counting views', async () => {
    await loginAsNewUser()
    const document = await createFilledDocument()
    const created = await shareCall(document.id, 'POST', { expiresInDays: 7 })
    expect(created.status).toBe(201)
    const link = (await created.json()) as CvShareLink
    expect(link.expiresAt).not.toBeNull()
    expect(link.viewCount).toBe(0)

    // Logged out: the public route still answers.
    testState.user = null
    const res = await publicCall(link.token)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
    const text = await extractPdfText(new Uint8Array(await res.arrayBuffer()))
    expect(text).toContain('Élodie Lefèvre')
    await publicCall(link.token)

    // The info route does not count as a view.
    const info = await publicCall(link.token, infoRoute, '/info')
    expect(await info.json()).toEqual({ title: 'Élodie Lefèvre' })

    const [row] = await testState.db.select().from(cvShareLinks)
    expect(row!.viewCount).toBe(2)
  })

  it('never serves the document as JSON, nor anything for an unknown token', async () => {
    await loginAsNewUser()
    const document = await createFilledDocument()
    const link = (await (await shareCall(document.id, 'POST', {})).json()) as CvShareLink
    testState.user = null
    const res = await publicCall(link.token)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    for (const token of ['nope', generateShareToken(), document.id]) {
      const missing = await publicCall(token)
      expect(missing.status).toBe(404)
      expect(await missing.json()).toMatchObject({ message: "Ce lien de partage n'existe pas." })
    }
  })

  it('refuses an expired link with a French message', async () => {
    await loginAsNewUser()
    const document = await createFilledDocument()
    const link = (await (
      await shareCall(document.id, 'POST', { expiresInDays: 7 })
    ).json()) as CvShareLink
    await testState.db.update(cvShareLinks).set({ expiresAt: new Date(Date.now() - 1000) })
    testState.user = null
    const res = await publicCall(link.token)
    expect(res.status).toBe(410)
    expect(await res.json()).toMatchObject({ message: 'Ce lien de partage a expiré.' })
  })

  it('stops working once revoked, and only its owner can revoke', async () => {
    const { user: owner } = await loginAsNewUser('owner@example.com')
    const document = await createFilledDocument()
    const link = (await (await shareCall(document.id, 'POST', {})).json()) as CvShareLink
    const revokeCall = () =>
      callRoute(revokeShare, {
        method: 'DELETE',
        path: `/api/cv-documents/${document.id}/share/${link.id}`,
        route: '/api/cv-documents/:id/share/:linkId',
      })

    await loginAsNewUser('other@example.com')
    expect((await revokeCall()).status).toBe(404)
    expect((await shareCall(document.id, 'GET')).status).toBe(404)
    expect((await shareCall(document.id, 'POST', {})).status).toBe(404)
    expect((await publicCall(link.token)).status).toBe(200)

    testState.user = { id: owner.id, email: owner.email, displayName: owner.displayName }
    expect((await revokeCall()).status).toBe(200)
    testState.user = null
    const res = await publicCall(link.token)
    expect(res.status).toBe(410)
    expect(await res.json()).toMatchObject({ message: 'Ce lien de partage a été désactivé.' })
  })

  it('caps the renders per token and minute', async () => {
    await loginAsNewUser()
    const document = await createFilledDocument()
    const link = (await (await shareCall(document.id, 'POST', {})).json()) as CvShareLink
    testState.user = null
    const statuses: number[] = []
    for (let i = 0; i < 21; i++)
      statuses.push((await publicCall(link.token, infoRoute, '/info')).status)
    // Info is not rate limited; the PDF is.
    expect(statuses.every((status) => status === 200)).toBe(true)
    const results = []
    for (let i = 0; i < 21; i++) results.push((await publicCall(link.token)).status)
    expect(results.at(-1)).toBe(429)
  }, 120_000)

  it('is deleted with its document', async () => {
    await loginAsNewUser()
    const document = await createFilledDocument()
    await shareCall(document.id, 'POST', {})
    await testState.db.delete(cvDocuments)
    expect(await testState.db.select().from(cvShareLinks)).toHaveLength(0)
  })
})

describe('GET /api/generations/:id/letter-pdf', () => {
  async function insertLetter(userId: string, profileId: string) {
    const [offer] = await testState.db
      .insert(jobOffers)
      .values({
        userId,
        profileId,
        title: 'Chargé de com',
        company: "Théâtre de l'Œuvre",
        rawText: 'Offre.',
      })
      .returning()
    const [letter] = await testState.db
      .insert(generations)
      .values({
        userId,
        kind: 'cover_letter',
        inputRefs: { offerId: offer!.id },
        output: { paragraphs: ['Madame, Monsieur,', 'Je suis très intéressée par ce poste.'] },
        model: 'test',
      })
      .returning()
    return letter!
  }

  const call = (id: string, query = '') =>
    callRoute(letterPdfRoute, {
      path: `/api/generations/${id}/letter-pdf${query}`,
      route: '/api/generations/:id/letter-pdf',
    })

  it("renders the letter with the header of the offer's profile CV by default", async () => {
    const { user, profile } = await loginAsNewUser()
    await createFilledDocument()
    const letter = await insertLetter(user.id, profile.id)
    const res = await call(letter.id)
    expect(res.status).toBe(200)
    const text = await extractPdfText(new Uint8Array(await res.arrayBuffer()))
    expect(text).toContain('Élodie Lefèvre')
    expect(text).toContain("Théâtre de l'Œuvre")
    expect(text).toContain('Je suis très intéressée par ce poste.')
  })

  it('falls back to a neutral design with the account name when there is no CV', async () => {
    const { user, profile } = await loginAsNewUser()
    const letter = await insertLetter(user.id, profile.id)
    const res = await call(letter.id, '?download=1')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(await extractPdfText(new Uint8Array(await res.arrayBuffer()))).toContain('Camille')
  })

  it("404s on someone else's letter or CV document", async () => {
    const { user, profile } = await loginAsNewUser('a@example.com')
    const document = await createFilledDocument()
    const letter = await insertLetter(user.id, profile.id)
    await loginAsNewUser('b@example.com')
    expect((await call(letter.id)).status).toBe(404)
    const mine = await loginAsNewUser('c@example.com')
    const own = await insertLetter(mine.user.id, mine.profile.id)
    expect((await call(own.id, `?cvDocumentId=${document.id}`)).status).toBe(404)
  })
})
