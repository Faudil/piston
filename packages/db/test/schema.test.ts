import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { resumes, users } from '../src/schema'
import { createTestDb } from '../src/testing'

describe('schema', () => {
  it('allows only one current resume per user', async () => {
    const db = await createTestDb()
    const [user] = await db
      .insert(users)
      .values({ email: 'a@example.com', displayName: 'A', passwordHash: 'x' })
      .returning()
    await db
      .insert(resumes)
      .values({ userId: user!.id, title: 'v1', rawText: 'cv', isCurrent: true })

    await expect(
      db.insert(resumes).values({ userId: user!.id, title: 'v2', rawText: 'cv', isCurrent: true }),
    ).rejects.toThrow()

    await db.insert(resumes).values({ userId: user!.id, title: 'v3', rawText: 'cv' })
    const rows = await db.select().from(resumes).where(eq(resumes.userId, user!.id))
    expect(rows).toHaveLength(2)
  })
})
