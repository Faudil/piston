import { beforeEach, describe, expect, it } from 'vitest'
import { eq, resumes } from '@piston/db'
import { LIMITS, type Resume } from '@piston/shared'
import listRoute from '../../server/api/resumes.get'
import createRoute from '../../server/api/resumes.post'
import setCurrentRoute from '../../server/api/resumes/[id]/current.patch'
import importRoute from '../../server/api/resumes/import.post'
import { extractPdfText } from '../../server/utils/pdf'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

async function list() {
  const res = await callRoute(listRoute, { path: '/api/resumes' })
  return (await res.json()) as Resume[]
}

function create(body: unknown) {
  return callRoute(createRoute, { method: 'POST', path: '/api/resumes', body })
}

function setCurrent(id: string) {
  return callRoute(setCurrentRoute, {
    method: 'PATCH',
    path: `/api/resumes/${id}/current`,
    route: '/api/resumes/:id/current',
  })
}

function importFile(file: Blob, filename: string, title?: string) {
  const form = new FormData()
  form.append('file', file, filename)
  if (title) form.append('title', title)
  return callRoute(importRoute, { method: 'POST', path: '/api/resumes/import', body: form })
}

/**
 * Builds a minimal but valid one-page PDF showing `text`, so the import can be
 * tested with the real pdf-parse instead of a mock. Byte offsets in the xref
 * table must be exact, hence the computation.
 */
function makePdf(text: string): Blob {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return new Blob([pdf], { type: 'application/pdf' })
}

describe('resumes', () => {
  it('creates versions newest first, the latest one being current', async () => {
    const { resume: first } = await loginAsNewUser()
    const res = await create({ title: 'CV v2', rawText: 'Nouveau texte' })
    expect(res.status).toBe(201)
    const created = (await res.json()) as Resume
    expect(created).toMatchObject({ title: 'CV v2', isCurrent: true, sourceFilename: null })

    const versions = await list()
    expect(versions.map((r) => r.id)).toEqual([created.id, first.id])
    expect(versions.filter((r) => r.isCurrent).map((r) => r.id)).toEqual([created.id])
  })

  it('validates the body', async () => {
    await loginAsNewUser()
    expect((await create({ title: 'CV', rawText: '' })).status).toBe(400)
    const tooLong = 'a'.repeat(LIMITS.maxTextLength + 1)
    expect((await create({ title: 'CV', rawText: tooLong })).status).toBe(400)
  })

  it('switches the current version, keeping a single one', async () => {
    const { resume: first } = await loginAsNewUser()
    await create({ title: 'CV v2', rawText: 'Nouveau texte' })

    const res = await setCurrent(first.id)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: first.id, isCurrent: true })

    const current = (await list()).filter((r) => r.isCurrent)
    expect(current.map((r) => r.id)).toEqual([first.id])
  })

  it("isolates users: no listing nor switching of another user's resumes", async () => {
    const { resume: aliceResume } = await loginAsNewUser('alice@example.com')
    await create({ title: 'CV Alice v2', rawText: 'Texte Alice' })
    const { resume: bobResume } = await loginAsNewUser('bob@example.com')

    expect((await list()).map((r) => r.id)).toEqual([bobResume.id])
    expect((await setCurrent(aliceResume.id)).status).toBe(404)

    // Alice's current resume is untouched, and Bob still has his own.
    const aliceCurrent = await testState.db
      .select()
      .from(resumes)
      .where(eq(resumes.isCurrent, true))
    expect(aliceCurrent).toHaveLength(2)
    expect(aliceCurrent.find((r) => r.id === aliceResume.id)).toBeUndefined()
  })

  it('requires a session', async () => {
    expect((await callRoute(listRoute, { path: '/api/resumes' })).status).toBe(401)
  })
})

describe('resume PDF import', () => {
  it('extracts the text of a PDF and stores only the text', async () => {
    await loginAsNewUser()
    const res = await importFile(makePdf('Camille Martin - Developpeuse web'), 'cv-camille.pdf')
    expect(res.status).toBe(201)
    const created = (await res.json()) as Resume
    expect(created).toMatchObject({
      title: 'cv-camille',
      sourceFilename: 'cv-camille.pdf',
      isCurrent: true,
      rawText: 'Camille Martin - Developpeuse web',
    })
  })

  it('uses the given title', async () => {
    await loginAsNewUser()
    const res = await importFile(makePdf('Texte'), 'cv.pdf', 'Mon CV 2026')
    expect(await res.json()).toMatchObject({ title: 'Mon CV 2026' })
  })

  it('rejects files that are not PDFs, whatever their name', async () => {
    await loginAsNewUser()
    const res = await importFile(new Blob(['Bonjour'], { type: 'text/plain' }), 'cv.pdf')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ message: "Ce fichier n'est pas un PDF." })
  })

  it('rejects files over 5 MB', async () => {
    await loginAsNewUser()
    const big = new Blob(['%PDF-1.4\n', new Uint8Array(LIMITS.maxPdfBytes)])
    const res = await importFile(big, 'cv.pdf')
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ message: 'Le PDF ne doit pas dépasser 5 Mo.' })
  })

  it('explains what to do with a PDF that has no text (scanned)', async () => {
    await loginAsNewUser()
    // A scanned PDF has no text layer: extraction yields nothing...
    const scan = new Uint8Array(await makePdf('').arrayBuffer())
    expect(await extractPdfText(scan)).toBe('')
    // ...and the route refuses it instead of storing an empty resume.
    const res = await importFile(makePdf(''), 'scan.pdf')
    expect(res.status).toBe(400)
    expect(((await res.json()) as { message: string }).message).toContain('image')
    expect(await testState.db.select().from(resumes)).toHaveLength(1)
  })

  it('rejects a request without file', async () => {
    await loginAsNewUser()
    const form = new FormData()
    form.append('title', 'CV')
    const res = await callRoute(importRoute, {
      method: 'POST',
      path: '/api/resumes/import',
      body: form,
    })
    expect(res.status).toBe(400)
  })
})
