import { beforeEach, describe, expect, it } from 'vitest'
import { eq, resumes } from '@piston/db'
import type { Resume } from '@piston/shared'
import listRoute from '../../server/api/resumes.get'
import createRoute from '../../server/api/resumes.post'
import downloadRoute from '../../server/api/resumes/[id]/download.get'
import patchRoute from '../../server/api/resumes/[id].patch'
import deleteRoute from '../../server/api/resumes/[id].delete'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

const call = (
  handler: Parameters<typeof callRoute>[0],
  id: string,
  method = 'GET',
  body?: unknown,
  suffix = '',
) =>
  callRoute(handler, {
    method,
    path: `/api/resumes/${id}${suffix}`,
    route: `/api/resumes/:id${suffix}`,
    body,
  })

const download = (id: string) => call(downloadRoute, id, 'GET', undefined, '/download')

async function list() {
  return (await (await callRoute(listRoute, { path: '/api/resumes' })).json()) as Resume[]
}

/** Bytes that are not valid UTF-8, to prove the file is not treated as text. */
const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28])

describe('resume download', () => {
  it('serves the original PDF byte for byte, with a safe filename', async () => {
    const { resume } = await loginAsNewUser()
    await testState.db
      .update(resumes)
      .set({ sourcePdf: pdfBytes, sourceFilename: 'CV "Élodie"; é.pdf' })
      .where(eq(resumes.id, resume.id))

    const res = await download(resume.id)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    const disposition = res.headers.get('content-disposition')!
    expect(disposition).toMatch(/^attachment; filename="[^";]*"; filename\*=UTF-8''/)
    expect(disposition).toContain("filename*=UTF-8''CV%20%22%C3%89lodie%22%3B%20%C3%A9.pdf")
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdfBytes)
  })

  it('serves pasted resumes as a text file', async () => {
    const { resume } = await loginAsNewUser()
    const res = await download(resume.id)
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('content-disposition')).toContain('filename="CV.txt"')
    expect(await res.text()).toBe(resume.rawText)
  })

  it('never leaks the bytes in listings and flags hasPdf', async () => {
    const { resume } = await loginAsNewUser()
    await testState.db.update(resumes).set({ sourcePdf: pdfBytes })
    const [item] = await list()
    expect(item).toMatchObject({ id: resume.id, hasPdf: true })
    expect(item).not.toHaveProperty('sourcePdf')
  })

  it("returns 404 for another user's resume", async () => {
    const { resume } = await loginAsNewUser('alice@example.com')
    await loginAsNewUser('bob@example.com')
    expect((await download(resume.id)).status).toBe(404)
  })
})

describe('resume rename and delete', () => {
  it('renames a version', async () => {
    const { resume } = await loginAsNewUser()
    const res = await call(patchRoute, resume.id, 'PATCH', { title: '  CV 2026  ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: resume.id, title: 'CV 2026' })
    expect((await call(patchRoute, resume.id, 'PATCH', { title: ' ' })).status).toBe(400)
  })

  it('makes the most recent remaining version current when the current one is deleted', async () => {
    const { resume: first } = await loginAsNewUser()
    const second = (await (
      await callRoute(createRoute, {
        method: 'POST',
        path: '/api/resumes',
        body: { title: 'v2', rawText: 'b' },
      })
    ).json()) as Resume
    const third = (await (
      await callRoute(createRoute, {
        method: 'POST',
        path: '/api/resumes',
        body: { title: 'v3', rawText: 'c' },
      })
    ).json()) as Resume

    expect((await call(deleteRoute, third.id, 'DELETE')).status).toBe(200)
    const versions = await list()
    expect(versions.map((r) => r.id)).toEqual([second.id, first.id])
    expect(versions.filter((r) => r.isCurrent).map((r) => r.id)).toEqual([second.id])
  })

  it('keeps the current version when another one is deleted, and allows deleting the last', async () => {
    const { resume: first } = await loginAsNewUser()
    const second = (await (
      await callRoute(createRoute, {
        method: 'POST',
        path: '/api/resumes',
        body: { title: 'v2', rawText: 'b' },
      })
    ).json()) as Resume

    await call(deleteRoute, first.id, 'DELETE')
    expect((await list()).map((r) => [r.id, r.isCurrent])).toEqual([[second.id, true]])
    await call(deleteRoute, second.id, 'DELETE')
    expect(await list()).toEqual([])
  })

  it('isolates users on rename and delete', async () => {
    const { resume } = await loginAsNewUser('alice@example.com')
    await loginAsNewUser('bob@example.com')
    expect((await call(patchRoute, resume.id, 'PATCH', { title: 'Hack' })).status).toBe(404)
    expect((await call(deleteRoute, resume.id, 'DELETE')).status).toBe(404)
    expect(await testState.db.select().from(resumes)).toHaveLength(2)
  })
})
