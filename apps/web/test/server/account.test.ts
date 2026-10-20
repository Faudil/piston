import { beforeEach, describe, expect, it } from 'vitest'
import { applications, eq, generations, jobOffers, resumes, users } from '@piston/db'
import accountPatch from '../../server/api/account.patch'
import accountDelete from '../../server/api/account.delete'
import passwordRoute from '../../server/api/account/password.post'
import exportRoute from '../../server/api/account/export.get'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

const send = (
  handler: Parameters<typeof callRoute>[0],
  path: string,
  method: string,
  body?: unknown,
) => callRoute(handler, { method, path, body })

async function seedData(userId: string) {
  const [offer] = await testState.db
    .insert(jobOffers)
    .values({ userId, title: 'Dev', rawText: 'Texte' })
    .returning()
  await testState.db.insert(applications).values({ userId, jobOfferId: offer!.id })
  await testState.db.insert(generations).values({
    userId,
    kind: 'resume_review',
    output: {} as never,
    model: 'test',
  })
  await testState.db.update(resumes).set({ sourcePdf: new Uint8Array([1, 2, 3]) })
}

describe('account', () => {
  it('renames the user and refreshes the session', async () => {
    const { user } = await loginAsNewUser()
    const res = await send(accountPatch, '/api/account', 'PATCH', { displayName: ' Camille M. ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ displayName: 'Camille M.' })
    expect(testState.user?.displayName).toBe('Camille M.')
    const [row] = await testState.db.select().from(users).where(eq(users.id, user.id))
    expect(row!.displayName).toBe('Camille M.')
    expect((await send(accountPatch, '/api/account', 'PATCH', { displayName: ' ' })).status).toBe(
      400,
    )
  })

  it('changes the password when the current one is right', async () => {
    const { user } = await loginAsNewUser()
    const res = await send(passwordRoute, '/api/account/password', 'POST', {
      currentPassword: 'password123',
      newPassword: 'a-much-better-one',
    })
    expect(res.status).toBe(200)
    const [row] = await testState.db.select().from(users).where(eq(users.id, user.id))
    expect(row!.passwordHash).toBe('hashed:a-much-better-one')
  })

  it('refuses a wrong current password or a short new one', async () => {
    const { user } = await loginAsNewUser()
    const wrong = await send(passwordRoute, '/api/account/password', 'POST', {
      currentPassword: 'nope',
      newPassword: 'a-much-better-one',
    })
    expect(wrong.status).toBe(400)
    expect(await wrong.json()).toMatchObject({ message: 'Le mot de passe actuel est incorrect.' })
    const short = await send(passwordRoute, '/api/account/password', 'POST', {
      currentPassword: 'password123',
      newPassword: 'short',
    })
    expect(short.status).toBe(400)
    const [row] = await testState.db.select().from(users).where(eq(users.id, user.id))
    expect(row!.passwordHash).toBe('hashed:password123')
  })

  it('exports the data as a JSON download without the hash nor the PDF bytes', async () => {
    const { user } = await loginAsNewUser('alice@example.com')
    await seedData(user.id)
    await loginAsNewUser('bob@example.com')

    testState.user = { id: user.id, email: user.email, displayName: user.displayName }
    const res = await send(exportRoute, '/api/account/export', 'GET')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toMatch(
      /filename="piston-export-\d{4}-\d{2}-\d{2}\.json"/,
    )
    const text = await res.text()
    expect(text).not.toContain('passwordHash')
    expect(text).not.toContain('hashed:')
    expect(text).not.toContain('sourcePdf')
    const data = JSON.parse(text)
    expect(data.profile).toMatchObject({ email: 'alice@example.com' })
    expect(data.resumes).toHaveLength(1)
    expect(data.resumes[0]).toMatchObject({ hasPdf: true })
    expect(data.offers).toHaveLength(1)
    expect(data.generations).toHaveLength(1)
    expect(data.applications).toHaveLength(1)
  })

  it('deletes the account only with the exact e-mail, cascading to everything', async () => {
    const { user } = await loginAsNewUser('alice@example.com')
    await seedData(user.id)
    const { user: bob } = await loginAsNewUser('bob@example.com')
    testState.user = { id: user.id, email: user.email, displayName: user.displayName }

    const wrong = await send(accountDelete, '/api/account', 'DELETE', {
      confirmEmail: 'bob@example.com',
    })
    expect(wrong.status).toBe(400)
    expect(await testState.db.select().from(users)).toHaveLength(2)

    const ok = await send(accountDelete, '/api/account', 'DELETE', {
      confirmEmail: ' Alice@Example.com ',
    })
    expect(ok.status).toBe(200)
    expect(testState.user).toBeNull()
    expect((await testState.db.select().from(users)).map((u) => u.id)).toEqual([bob.id])
    expect(await testState.db.select().from(jobOffers)).toHaveLength(0)
    expect(await testState.db.select().from(applications)).toHaveLength(0)
    expect(await testState.db.select().from(generations)).toHaveLength(0)
    // Only Bob's resume remains.
    expect(await testState.db.select().from(resumes)).toHaveLength(1)
  })

  it('requires a session', async () => {
    expect((await send(exportRoute, '/api/account/export', 'GET')).status).toBe(401)
  })
})
