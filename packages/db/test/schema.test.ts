import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { migrationsFolder } from '../src/migrate'
import {
  cvDocumentRevisions,
  cvDocuments,
  generations,
  jobOffers,
  resumeProfiles,
  resumes,
  users,
} from '../src/schema'
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

describe('migration 0003_resume_profiles', () => {
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

describe('migration 0004_cv_builder', () => {
  it('keeps existing data and adds the CV builder tables and generation kinds', async () => {
    const db = drizzle(new PGlite(), { casing: 'snake_case' })
    await migrate(db, { migrationsFolder: migrationsBefore('0004_cv_builder') })

    const inserted = await db.execute<{ id: string }>(sql`
      insert into users (email, display_name, password_hash) values ('a@example.com', 'A', 'x')
      returning id`)
    const userId = inserted.rows[0]!.id
    const profile = await db.execute<{ id: string }>(sql`
      insert into resume_profiles (user_id, name, is_default) values (${userId}, 'Principal', true)
      returning id`)
    const profileId = profile.rows[0]!.id
    await db.execute(sql`
      insert into resumes (user_id, profile_id, title, raw_text, is_current)
      values (${userId}, ${profileId}, 'v1', 'cv', true)`)
    await db.execute(sql`
      insert into generations (user_id, kind, output, model) values (${userId}, 'resume_review', '{}', 'm')`)

    await migrate(db, { migrationsFolder })

    expect(await db.select().from(resumes)).toHaveLength(1)
    expect(await db.select().from(generations)).toHaveLength(1)

    // The new kinds are usable, and a document with its revision can be stored and cascades.
    const [generation] = await db
      .insert(generations)
      .values({
        userId,
        kind: 'cv_edit',
        output: { summary: '', operations: [], dropped: 0 },
        model: 'm',
      })
      .returning()
    const content = { header: { fullName: 'A' } } as never
    const design = {
      accentColor: '#c8410b',
      font: 'inter',
      density: 'normal',
      language: 'fr',
    } as const
    const [document] = await db
      .insert(cvDocuments)
      .values({ userId, profileId, title: 'Mon CV', content, design })
      .returning()
    expect(document!.templateId).toBe('sobre')
    await db.insert(cvDocumentRevisions).values({
      documentId: document!.id,
      userId,
      label: 'Création',
      source: 'created',
      generationId: generation!.id,
      templateId: 'sobre',
      content,
      design,
    })

    await db.delete(resumeProfiles).where(eq(resumeProfiles.id, profileId))
    expect(await db.select().from(cvDocuments)).toHaveLength(0)
    expect(await db.select().from(cvDocumentRevisions)).toHaveLength(0)
  })
})
