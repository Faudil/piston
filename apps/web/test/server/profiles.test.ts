import { beforeEach, describe, expect, it } from 'vitest'
import { eq, generations, jobOffers, resumeProfiles, resumes } from '@piston/db'
import type { Generation, JobOffer, Paginated, Resume, ResumeProfile } from '@piston/shared'
import listRoute from '../../server/api/profiles.get'
import createRoute from '../../server/api/profiles.post'
import patchRoute from '../../server/api/profiles/[id].patch'
import deleteRoute from '../../server/api/profiles/[id].delete'
import listResumesRoute from '../../server/api/resumes.get'
import createResumeRoute from '../../server/api/resumes.post'
import importResumeRoute from '../../server/api/resumes/import.post'
import setCurrentRoute from '../../server/api/resumes/[id]/current.patch'
import deleteResumeRoute from '../../server/api/resumes/[id].delete'
import createOfferRoute from '../../server/api/offers.post'
import patchOfferRoute from '../../server/api/offers/[id].patch'
import generationsRoute from '../../server/api/generations.get'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

async function list() {
  const res = await callRoute(listRoute, { path: '/api/profiles' })
  return (await res.json()) as ResumeProfile[]
}

const create = (name: string) =>
  callRoute(createRoute, { method: 'POST', path: '/api/profiles', body: { name } })

async function createOk(name: string) {
  const res = await create(name)
  expect(res.status).toBe(201)
  return (await res.json()) as ResumeProfile
}

const patch = (id: string, body: unknown) =>
  callRoute(patchRoute, {
    method: 'PATCH',
    path: `/api/profiles/${id}`,
    route: '/api/profiles/:id',
    body,
  })

const remove = (id: string) =>
  callRoute(deleteRoute, {
    method: 'DELETE',
    path: `/api/profiles/${id}`,
    route: '/api/profiles/:id',
  })

const addResume = (body: Record<string, unknown>) =>
  callRoute(createResumeRoute, { method: 'POST', path: '/api/resumes', body })

async function listResumes(query = '') {
  const res = await callRoute(listResumesRoute, { path: `/api/resumes${query}` })
  return (await res.json()) as Resume[]
}

/** A minimal one-page PDF showing `text` (see resumes.test.ts for the format). */
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

describe('resume profiles', () => {
  it('lists profiles with their current version and number of versions', async () => {
    const { profile, resume } = await loginAsNewUser()
    const marketing = await createOk('Marketing digital')
    expect(marketing).toMatchObject({
      name: 'Marketing digital',
      isDefault: false,
      current: null,
      versionsCount: 0,
    })

    const profiles = await list()
    expect(profiles.map((p) => p.name)).toEqual(['Principal', 'Marketing digital'])
    expect(profiles[0]).toMatchObject({
      id: profile.id,
      isDefault: true,
      current: { id: resume.id, title: 'CV' },
      versionsCount: 1,
    })
  })

  it('makes the first profile of a user the default one', async () => {
    const { user } = await loginAsNewUser()
    await testState.db.delete(resumeProfiles).where(eq(resumeProfiles.userId, user.id))

    expect((await createOk('Communication')).isDefault).toBe(true)
    expect((await createOk('Marketing')).isDefault).toBe(false)
  })

  it('validates names and refuses duplicates', async () => {
    await loginAsNewUser()
    expect((await create('  ')).status).toBe(400)
    expect((await create('a'.repeat(61))).status).toBe(400)

    const res = await create('Principal')
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ message: 'Tu as déjà un profil de CV avec ce nom.' })
  })

  it('renames a profile and moves the default', async () => {
    const { profile } = await loginAsNewUser()
    const marketing = await createOk('Marketing')

    const renamed = await patch(marketing.id, { name: 'Marketing digital' })
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({ name: 'Marketing digital', isDefault: false })

    const res = await patch(marketing.id, { isDefault: true })
    expect(await res.json()).toMatchObject({ isDefault: true })
    const profiles = await list()
    expect(profiles.filter((p) => p.isDefault).map((p) => p.id)).toEqual([marketing.id])

    // Making the default profile default again changes nothing.
    expect((await patch(marketing.id, { isDefault: true })).status).toBe(200)
    expect((await list()).find((p) => p.id === profile.id)!.isDefault).toBe(false)

    expect((await patch(marketing.id, { name: 'Principal' })).status).toBe(409)
    expect((await patch(marketing.id, {})).status).toBe(400)
  })

  it('deletes a profile with its versions, and hands the default to the oldest remaining one', async () => {
    const { user, profile } = await loginAsNewUser()
    const second = await createOk('Communication')
    const third = await createOk('Marketing')
    const offer = (await (
      await callRoute(createOfferRoute, {
        method: 'POST',
        path: '/api/offers',
        body: { title: 'Chargée de com', rawText: 'Texte', profileId: profile.id },
      })
    ).json()) as JobOffer

    expect((await remove(profile.id)).status).toBe(200)
    expect(await testState.db.select().from(resumes).where(eq(resumes.userId, user.id))).toEqual([])
    const profiles = await list()
    expect(profiles.map((p) => [p.id, p.isDefault])).toEqual([
      [second.id, true],
      [third.id, false],
    ])
    // The offer falls back to the default profile.
    const [row] = await testState.db.select().from(jobOffers).where(eq(jobOffers.id, offer.id))
    expect(row!.profileId).toBeNull()

    // Deleting every profile is allowed: the user is back to having no resume.
    expect((await remove(second.id)).status).toBe(200)
    expect((await remove(third.id)).status).toBe(200)
    expect(await list()).toEqual([])
  })

  it("never shows nor changes another user's profiles", async () => {
    const { profile: alice } = await loginAsNewUser('alice@example.com')
    await loginAsNewUser('bob@example.com')

    expect((await list()).map((p) => p.id)).not.toContain(alice.id)
    expect((await patch(alice.id, { name: 'Piraté' })).status).toBe(404)
    expect((await patch(alice.id, { isDefault: true })).status).toBe(404)
    expect((await remove(alice.id)).status).toBe(404)
    const [row] = await testState.db
      .select()
      .from(resumeProfiles)
      .where(eq(resumeProfiles.id, alice.id))
    expect(row).toMatchObject({ name: 'Principal', isDefault: true })
  })

  it('requires a session', async () => {
    expect((await list()) as unknown).toMatchObject({ statusCode: 401 })
  })
})

describe('resumes in profiles', () => {
  it('adds versions to the chosen profile, each profile keeping its own current version', async () => {
    const { profile, resume } = await loginAsNewUser()
    const marketing = await createOk('Marketing')

    const res = await addResume({
      title: 'CV marketing',
      rawText: 'Texte',
      profileId: marketing.id,
    })
    expect(res.status).toBe(201)
    const created = (await res.json()) as Resume
    expect(created).toMatchObject({ profileId: marketing.id, isCurrent: true })

    const all = await listResumes()
    expect(all.filter((r) => r.isCurrent).map((r) => r.id)).toEqual([created.id, resume.id])
    expect((await listResumes(`?profileId=${profile.id}`)).map((r) => r.id)).toEqual([resume.id])
    expect((await listResumes(`?profileId=${marketing.id}`)).map((r) => r.id)).toEqual([created.id])
  })

  it('keeps a separate history and current version for each profile', async () => {
    const { profile, resume } = await loginAsNewUser()
    const marketing = await createOk('Marketing')
    const p2 = (await (
      await addResume({ title: 'Principal v2', rawText: 'Texte', profileId: profile.id })
    ).json()) as Resume
    const m1 = (await (
      await addResume({ title: 'Marketing v1', rawText: 'Texte', profileId: marketing.id })
    ).json()) as Resume
    const m2 = (await (
      await addResume({ title: 'Marketing v2', rawText: 'Texte', profileId: marketing.id })
    ).json()) as Resume

    const principal = await listResumes(`?profileId=${profile.id}`)
    expect(principal.map((r) => r.id)).toEqual([p2.id, resume.id])
    expect(principal.filter((r) => r.isCurrent).map((r) => r.id)).toEqual([p2.id])

    const marketingVersions = await listResumes(`?profileId=${marketing.id}`)
    expect(marketingVersions.map((r) => r.id)).toEqual([m2.id, m1.id])
    expect(marketingVersions.filter((r) => r.isCurrent).map((r) => r.id)).toEqual([m2.id])

    const profiles = await list()
    expect(profiles.map((p) => [p.current?.id, p.versionsCount])).toEqual([
      [p2.id, 2],
      [m2.id, 2],
    ])
  })

  it("filters versions by profile only within the user's own resumes", async () => {
    const { profile: alice } = await loginAsNewUser('alice@example.com')
    await loginAsNewUser('bob@example.com')
    expect(await listResumes(`?profileId=${alice.id}`)).toEqual([])
    expect(
      (await callRoute(listResumesRoute, { path: '/api/resumes?profileId=nope' })).status,
    ).toBe(400)
  })

  it('adds to the default profile when none is given', async () => {
    const { profile, resume } = await loginAsNewUser()
    await createOk('Marketing')
    const created = (await (await addResume({ title: 'v2', rawText: 'Texte' })).json()) as Resume
    expect(created.profileId).toBe(profile.id)
    const [old] = await testState.db.select().from(resumes).where(eq(resumes.id, resume.id))
    expect(old!.isCurrent).toBe(false)
  })

  it('creates « Principal » for a user without profiles', async () => {
    const { user } = await loginAsNewUser()
    await testState.db.delete(resumeProfiles).where(eq(resumeProfiles.userId, user.id))

    const created = (await (await addResume({ title: 'CV', rawText: 'Texte' })).json()) as Resume
    const profiles = await list()
    expect(profiles).toHaveLength(1)
    expect(profiles[0]).toMatchObject({
      id: created.profileId,
      name: 'Principal',
      isDefault: true,
      current: { id: created.id },
    })
  })

  it('imports a PDF into a profile', async () => {
    await loginAsNewUser()
    const marketing = await createOk('Marketing')
    const form = new FormData()
    form.append('file', makePdf('Camille Martin'), 'cv.pdf')
    form.append('profileId', marketing.id)
    const res = await callRoute(importResumeRoute, {
      method: 'POST',
      path: '/api/resumes/import',
      body: form,
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ profileId: marketing.id, isCurrent: true })

    const bad = new FormData()
    bad.append('file', makePdf('Camille Martin'), 'cv.pdf')
    bad.append('profileId', 'pas-un-uuid')
    const badRes = await callRoute(importResumeRoute, {
      method: 'POST',
      path: '/api/resumes/import',
      body: bad,
    })
    expect(badRes.status).toBe(400)
  })

  it("refuses another user's profile", async () => {
    const { profile: alice } = await loginAsNewUser('alice@example.com')
    await loginAsNewUser('bob@example.com')
    const res = await addResume({ title: 'CV', rawText: 'Texte', profileId: alice.id })
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ message: 'Profil de CV introuvable.' })
  })

  it('switches and deletes the current version within its profile only', async () => {
    const { resume } = await loginAsNewUser()
    const marketing = await createOk('Marketing')
    const m1 = (await (
      await addResume({ title: 'M1', rawText: 'Texte', profileId: marketing.id })
    ).json()) as Resume
    const m2 = (await (
      await addResume({ title: 'M2', rawText: 'Texte', profileId: marketing.id })
    ).json()) as Resume

    await callRoute(setCurrentRoute, {
      method: 'PATCH',
      path: `/api/resumes/${m1.id}/current`,
      route: '/api/resumes/:id/current',
    })
    let current = (await listResumes()).filter((r) => r.isCurrent).map((r) => r.id)
    expect(current.sort()).toEqual([m1.id, resume.id].sort())

    await callRoute(deleteResumeRoute, {
      method: 'DELETE',
      path: `/api/resumes/${m1.id}`,
      route: '/api/resumes/:id',
    })
    current = (await listResumes()).filter((r) => r.isCurrent).map((r) => r.id)
    expect(current.sort()).toEqual([m2.id, resume.id].sort())
  })
})

describe('offers with a resume profile', () => {
  const createOffer = (body: Record<string, unknown>) =>
    callRoute(createOfferRoute, {
      method: 'POST',
      path: '/api/offers',
      body: { title: 'Chargée de com', rawText: 'Texte', ...body },
    })
  const patchOffer = (id: string, body: unknown) =>
    callRoute(patchOfferRoute, {
      method: 'PATCH',
      path: `/api/offers/${id}`,
      route: '/api/offers/:id',
      body,
    })

  it('stores, changes and clears the profile of an offer', async () => {
    await loginAsNewUser()
    const marketing = await createOk('Marketing')

    const plain = (await (await createOffer({})).json()) as JobOffer
    expect(plain.profileId).toBeNull()

    const res = await createOffer({ profileId: marketing.id })
    expect(res.status).toBe(201)
    const offer = (await res.json()) as JobOffer
    expect(offer.profileId).toBe(marketing.id)

    const cleared = await patchOffer(offer.id, { profileId: null })
    expect(await cleared.json()).toMatchObject({ profileId: null, title: 'Chargée de com' })
    const set = await patchOffer(offer.id, { profileId: marketing.id })
    expect(await set.json()).toMatchObject({ profileId: marketing.id })
  })

  it("answers 404 for another user's profile", async () => {
    const { profile: alice } = await loginAsNewUser('alice@example.com')
    await loginAsNewUser('bob@example.com')
    expect((await createOffer({ profileId: alice.id })).status).toBe(404)

    const offer = (await (await createOffer({})).json()) as JobOffer
    expect((await patchOffer(offer.id, { profileId: alice.id })).status).toBe(404)
  })
})

describe('GET /api/generations?profileId=', () => {
  it('filters by the profile recorded in the generation', async () => {
    const { user, profile, resume } = await loginAsNewUser()
    const marketing = await createOk('Marketing')
    const values = { userId: user.id, kind: 'resume_review' as const, output: {} as never }
    const [ofDefault, ofMarketing] = await testState.db
      .insert(generations)
      .values([
        { ...values, model: 'a', inputRefs: { resumeId: resume.id, profileId: profile.id } },
        { ...values, model: 'b', inputRefs: { resumeId: resume.id, profileId: marketing.id } },
        { ...values, model: 'c', inputRefs: {} },
      ])
      .returning()

    const page = async (profileId: string) => {
      const res = await callRoute(generationsRoute, {
        path: `/api/generations?kind=resume_review&profileId=${profileId}`,
      })
      return ((await res.json()) as Paginated<Generation>).items.map((g) => g.id).sort()
    }
    expect(await page(profile.id)).toEqual([ofDefault!.id])
    expect(await page(marketing.id)).toEqual([ofMarketing!.id])
  })
})
