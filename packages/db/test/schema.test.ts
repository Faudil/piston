import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { migrationsFolder } from '../src/migrate'
import { generations, jobOffers, resumeProfiles, resumes, users } from '../src/schema'
import { createTestDb } from '../src/testing'

describe('schema', () => {
  it('allows only one current resume per profile', async () => {
    const db = await createTestDb()
    const [user] = await db
      .insert(users)
      .values({ email: 'a@example.com', displayName: 'A', passwordHash: 'x' })
      .returning()
    const [profileA, profileB] = await db
      .insert(resumeProfiles)
      .values([
        { userId: user!.id, name: 'Communication', isDefault: true },
        { userId: user!.id, name: 'Marketing' },
      ])
      .returning()
    const values = { userId: user!.id, rawText: 'cv' }
    await db
      .insert(resumes)
      .values({ ...values, profileId: profileA!.id, title: 'v1', isCurrent: true })

    await expect(
      db
        .insert(resumes)
        .values({ ...values, profileId: profileA!.id, title: 'v2', isCurrent: true }),
    ).rejects.toThrow()

    // Another profile has its own current version.
    await db
      .insert(resumes)
      .values({ ...values, profileId: profileB!.id, title: 'v3', isCurrent: true })
    const rows = await db.select().from(resumes).where(eq(resumes.userId, user!.id))
    expect(rows).toHaveLength(2)
  })

  it('allows only one default profile per user', async () => {
    const db = await createTestDb()
    const [user] = await db
      .insert(users)
      .values({ email: 'a@example.com', displayName: 'A', passwordHash: 'x' })
      .returning()
    await db.insert(resumeProfiles).values({ userId: user!.id, name: 'A', isDefault: true })
    await expect(
      db.insert(resumeProfiles).values({ userId: user!.id, name: 'B', isDefault: true }),
    ).rejects.toThrow()
  })
})

describe('migration 0003_resume_profiles', () => {
  const folders: string[] = []
  afterAll(() => folders.forEach((folder) => rmSync(folder, { recursive: true, force: true })))

  /** A copy of the migrations folder whose journal stops before `tag`. */
  function migrationsBefore(tag: string) {
    const folder = mkdtempSync(join(tmpdir(), 'piston-migrations-'))
    folders.push(folder)
    cpSync(migrationsFolder, folder, { recursive: true })
    const journalPath = join(folder, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: Array<{ tag: string }>
    }
    const index = journal.entries.findIndex((entry) => entry.tag === tag)
    expect(index).toBeGreaterThan(0)
    journal.entries = journal.entries.slice(0, index)
    writeFileSync(journalPath, JSON.stringify(journal))
    return folder
  }

  it('moves existing resumes into a default « Principal » profile', async () => {
    const db = drizzle(new PGlite(), { casing: 'snake_case' })
    await migrate(db, { migrationsFolder: migrationsBefore('0003_resume_profiles') })

    // Data as it existed before profiles: raw SQL, the current schema no longer matches.
    const inserted = await db.execute<{ id: string }>(sql`
      insert into users (email, display_name, password_hash) values
        ('with@example.com', 'With', 'x'), ('without@example.com', 'Without', 'x')
      returning id`)
    const [withResumes, withoutResumes] = inserted.rows.map((row) => row.id)
    await db.execute(sql`
      insert into resumes (user_id, title, raw_text, is_current) values
        (${withResumes}, 'v1', 'cv', false), (${withResumes}, 'v2', 'cv', true)`)
    await db.execute(sql`
      insert into job_offers (user_id, title, raw_text) values (${withResumes}, 'Offre', 'texte')`)
    await db.execute(sql`
      insert into generations (user_id, kind, input_refs, output, model)
      select user_id, 'resume_review', jsonb_build_object('resumeId', id), '{}', 'm' from resumes`)
    await db.execute(sql`
      insert into generations (user_id, kind, output, model)
      values (${withResumes}, 'search_leads', '{}', 'm')`)

    await migrate(db, { migrationsFolder })

    const profiles = await db.select().from(resumeProfiles)
    expect(profiles).toHaveLength(1)
    expect(profiles[0]).toMatchObject({ userId: withResumes, name: 'Principal', isDefault: true })
    expect(profiles.some((p) => p.userId === withoutResumes)).toBe(false)

    const rows = await db.select().from(resumes)
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.profileId === profiles[0]!.id)).toBe(true)
    expect(rows.find((row) => row.isCurrent)?.title).toBe('v2')

    const [offer] = await db.select().from(jobOffers)
    expect(offer!.profileId).toBeNull()

    // Generations made from a resume now also name its profile.
    const refs = (await db.select().from(generations)).map((g) => g.inputRefs)
    expect(refs.filter((r) => r.profileId === profiles[0]!.id)).toHaveLength(2)
    expect(refs.filter((r) => !r.resumeId)).toEqual([{}])
  })
})
