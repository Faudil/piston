import { eq, sql } from 'drizzle-orm'
import type { Database } from './client'
import { generatePassword, hashPassword } from './password'
import { users } from './schema'

/** Every account, oldest first. */
export function listUsers(db: Database) {
  return db
    .select({
      email: users.email,
      name: users.displayName,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt)
}

/**
 * Replaces a user's password with a random temporary one and returns it, or
 * null when no user has that e-mail. Bumping the session version also logs
 * the user out everywhere.
 */
export async function resetPassword(db: Database, email: string): Promise<string | null> {
  const password = generatePassword()
  const updated = await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.email, email.trim().toLowerCase()))
    .returning({ id: users.id })
  return updated.length > 0 ? password : null
}

/** Grants or removes the admin role; returns false when no user has that e-mail. */
export async function setAdminRole(db: Database, email: string, isAdmin: boolean) {
  const updated = await db
    .update(users)
    .set({ isAdmin })
    .where(eq(users.email, email.trim().toLowerCase()))
    .returning({ id: users.id })
  return updated.length > 0
}
