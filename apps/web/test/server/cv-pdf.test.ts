import { beforeEach, describe, expect, it } from 'vitest'
import { resumes } from '@piston/db'
import { CvDesign, cvTemplateIds, type CvDocument, type Resume } from '@piston/shared'
import createRoute from '../../server/api/cv-documents.post'
import patchRoute from '../../server/api/cv-documents/[id].patch'
import pdfRoute from '../../server/api/cv-documents/[id]/pdf.get'
import exportRoute from '../../server/api/cv-documents/[id]/export.get'
import saveVersionRoute from '../../server/api/cv-documents/[id]/save-version.post'
import { extractPdfText } from '../../server/utils/pdf'
import { renderCvPdf } from '../../server/utils/cv-pdf'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

/** A filled document, with French accents and typographic characters everywhere. */
async function createFilledDocument() {
  const res = await callRoute(createRoute, { method: 'POST', path: '/api/cv-documents', body: {} })
  const document = (await res.json()) as CvDocument
  const content = {
    ...document.content,
    header: {
      fullName: 'Élodie Lefèvre',
      title: 'Chargée de communication événementielle',
      email: 'elodie@example.com',
      phone: '06 12 34 56 78',
      city: 'Besançon',
      links: [{ id: 'l1', label: 'LinkedIn', url: 'linkedin.com/in/elodie-lefevre' }],
    },
    summary: 'Œuvre à « faire connaître » les événements culturels — 5 ans d’expérience 🚀.',
    experiences: [
      {
        id: 'e1',
        title: 'Chargée de communication',
        organization: 'Théâtre du Châtelet',
        location: 'Paris',
        start: '03/2021',
        end: "Aujourd'hui",
        bullets: [
          { id: 'b1', text: 'Pilotage de la communication de 12 spectacles par saison' },
          { id: 'b2', text: 'Hausse de la fréquentation de [X %] grâce aux réseaux sociaux' },
        ],
      },
    ],
    skills: [{ id: 's1', name: 'Outils', items: ['Canva', 'Suite Adobe', 'WordPress'] }],
    languages: [{ id: 'g1', name: 'Anglais', level: 'C1' }],
  }
  const saved = await callRoute(patchRoute, {
    method: 'PATCH',
    path: `/api/cv-documents/${document.id}`,
    route: '/api/cv-documents/:id',
    body: { content },
  })
  expect(saved.status).toBe(200)
  return (await saved.json()) as CvDocument
}

const getPdf = (id: string, query = '') =>
  callRoute(pdfRoute, {
    path: `/api/cv-documents/${id}/pdf${query}`,
    route: '/api/cv-documents/:id/pdf',
  })

describe('GET /api/cv-documents/:id/pdf', () => {
  it('renders an A4 PDF with real, extractable text, accents included', async () => {
    await loginAsNewUser()
    const document = await createFilledDocument()

    const res = await getPdf(document.id)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toMatch(
      /^inline; filename="_lodie Lef_vre - CV.pdf"/,
    )
    const bytes = new Uint8Array(await res.arrayBuffer())
    const raw = Buffer.from(bytes).toString('latin1')
    expect(raw.startsWith('%PDF-')).toBe(true)
    // Embedded fonts and A4 pages.
    expect(raw).toContain('/FontFile2')
    expect(raw).toMatch(/\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/)
    // Clickable links: e-mail, phone, and the web link completed with https://.
    expect(raw).toContain('mailto:elodie@example.com')
    expect(raw).toContain('tel:0612345678')
    expect(raw).toContain('https://linkedin.com/in/elodie-lefevre')

    const text = await extractPdfText(bytes)
    for (const expected of [
      'Élodie Lefèvre',
      'Besançon',
      'Théâtre du Châtelet',
      'Œuvre à « faire connaître »',
      'd’expérience',
      "03/2021 – Aujourd'hui",
      'EXPÉRIENCE PROFESSIONNELLE',
      'Outils : Canva, Suite Adobe, WordPress',
    ]) {
      expect(text).toContain(expected)
    }
    // Characters the fonts cannot print are removed, not drawn as boxes.
    expect(text).not.toContain('🚀')
  })

  it('serves an attachment with ?download=1 and renders every template', async () => {
    await loginAsNewUser()
    const document = await createFilledDocument()
    const download = await getPdf(document.id, '?download=1')
    expect(download.headers.get('content-disposition')).toMatch(/^attachment;/)
    expect(download.headers.get('content-disposition')).toContain("filename*=UTF-8''%C3%89lodie")

    for (const templateId of cvTemplateIds) {
      const res = await getPdf(document.id, `?templateId=${templateId}`)
      expect(res.status).toBe(200)
      const text = await extractPdfText(new Uint8Array(await res.arrayBuffer()))
      expect(text.replace(/\s+/g, ' ')).toContain('Théâtre du Châtelet')
      expect(text).toContain('Anglais')
    }
    expect((await getPdf(document.id, '?templateId=inconnu')).status).toBe(400)
  })

  it('puts the name first in the reading order of the sidebar template', async () => {
    await loginAsNewUser()
    const document = await createFilledDocument()
    const res = await getPdf(document.id, '?templateId=moderne')
    const text = await extractPdfText(new Uint8Array(await res.arrayBuffer()))
    // What an ATS extracts: the name, then the sidebar, then the main column.
    expect(text.indexOf('Élodie Lefèvre')).toBe(0)
    expect(text.indexOf('CONTACT')).toBeLessThan(text.indexOf('EXPÉRIENCE PROFESSIONNELLE'))
  })

  it('renders an empty document and a very long one', async () => {
    const { user } = await loginAsNewUser()
    const blank = await renderCvPdf({
      content: (await createFilledDocument()).content,
      // A v1 design, upgraded like a stored one.
      design: CvDesign.parse({
        accentColor: '#1d4ed8',
        font: 'source-serif',
        density: 'compact',
        language: 'en',
      }),
      templateId: 'sobre',
    })
    expect(await extractPdfText(blank)).toContain('PROFESSIONAL EXPERIENCE')

    const res = await callRoute(createRoute, {
      method: 'POST',
      path: '/api/cv-documents',
      body: {},
    })
    const empty = (await res.json()) as CvDocument
    expect(
      Buffer.from(await renderCvPdf(empty))
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-')

    const long = structuredClone(empty.content)
    long.header.fullName = user.displayName
    long.experiences = Array.from({ length: 20 }, (_, i) => ({
      id: `x${i}`,
      title: `Poste ${i}`,
      organization: 'Entreprise',
      location: 'Lyon',
      start: '2020',
      end: '2021',
      bullets: Array.from({ length: 12 }, (_, j) => ({
        id: `y${i}z${j}`,
        text: 'é'.repeat(390) + j,
      })),
    }))
    const pdf = await renderCvPdf({ content: long, design: empty.design, templateId: 'sobre' })
    const text = await extractPdfText(pdf)
    expect(text).toContain('Poste 19')
  })

  it('answers 404 for another user’s document', async () => {
    await loginAsNewUser('alice@example.com')
    const document = await createFilledDocument()
    await loginAsNewUser('bob@example.com')
    expect((await getPdf(document.id)).status).toBe(404)
  })
})

describe('GET /api/cv-documents/:id/export', () => {
  const exportAs = (id: string, format: string) =>
    callRoute(exportRoute, {
      path: `/api/cv-documents/${id}/export?format=${format}`,
      route: '/api/cv-documents/:id/export',
    })

  it('exports plain text, Markdown and JSON', async () => {
    await loginAsNewUser()
    const document = await createFilledDocument()

    const txt = await exportAs(document.id, 'txt')
    expect(txt.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(txt.headers.get('content-disposition')).toContain('.txt')
    expect(await txt.text()).toContain('Chargée de communication — Théâtre du Châtelet')

    const md = await exportAs(document.id, 'md')
    expect(await md.text()).toContain('# Élodie Lefèvre')

    const json = (await (await exportAs(document.id, 'json')).json()) as {
      format: string
      content: unknown
    }
    expect(json.format).toBe('piston-cv')
    expect(json.content).toEqual(document.content)

    expect((await exportAs(document.id, 'docx')).status).toBe(400)
  })
})

describe('POST /api/cv-documents/:id/save-version', () => {
  const save = (id: string, body?: unknown) =>
    callRoute(saveVersionRoute, {
      method: 'POST',
      path: `/api/cv-documents/${id}/save-version`,
      route: '/api/cv-documents/:id/save-version',
      body,
    })

  it('adds the PDF and its extracted text as the current version of the profile', async () => {
    const { profile, resume: previous } = await loginAsNewUser()
    const document = await createFilledDocument()

    const res = await save(document.id, { title: 'Créé dans Piston' })
    expect(res.status).toBe(201)
    const version = (await res.json()) as Resume
    expect(version).toMatchObject({
      profileId: profile.id,
      title: 'Créé dans Piston',
      sourceFilename: 'Élodie Lefèvre - CV.pdf',
      hasPdf: true,
      isCurrent: true,
    })
    expect(version.rawText).toContain('Théâtre du Châtelet')
    expect(version.rawText).toContain('Besançon')

    const rows = await testState.db.select().from(resumes)
    expect(rows.find((row) => row.id === previous.id)!.isCurrent).toBe(false)
    const stored = rows.find((row) => row.id === version.id)!
    expect(Buffer.from(stored.sourcePdf!).subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('defaults the title to the document’s and refuses other users', async () => {
    await loginAsNewUser('alice@example.com')
    const document = await createFilledDocument()
    expect(((await (await save(document.id)).json()) as Resume).title).toBe('Mon CV')
    await loginAsNewUser('bob@example.com')
    expect((await save(document.id)).status).toBe(404)
  })
})
