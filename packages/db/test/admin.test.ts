import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { listUsers, resetPassword } from '../src/admin'
import type { Database } from '../src/client'
import { hashPassword } from '../src/password'
import { users } from '../src/schema'
import { createTestDb } from '../src/testing'

/**
 * nuxt-auth-utils verifies passwords with `new Hash(new Scrypt(options))` where
 * options come from runtimeConfig.hash.scrypt (unset by default, which the Scrypt constructor treats like {}).
 * This is that verifier, so a hash that passes here passes at login.
 */
const appVerifier = new Hash(new Scrypt({}))

let db: Database
beforeAll(async () => {
  db = await createTestDb()
  await db.insert(users).values({
    email: 'ada@example.com',
    displayName: 'Ada',
    passwordHash: await hashPassword('old'),
  })
})

describe('password hashing', () => {
  it('produces hashes the app verifies, and only for the right password', async () => {
    const hash = await hashPassword('correct horse')
    expect(hash).toMatch(/^\$scrypt\$/)
    expect(await appVerifier.verify(hash, 'correct horse')).toBe(true)
    expect(await appVerifier.verify(hash, 'wrong')).toBe(false)
  })
})

describe('resetPassword', () => {
  it('sets a strong temporary password the app accepts and bumps the session version', async () => {
    const password = await resetPassword(db, ' Ada@Example.com ')
    expect(password).toHaveLength(20)
    const user = await db.query.users.findFirst({ where: eq(users.email, 'ada@example.com') })
    expect(await appVerifier.verify(user!.passwordHash, password!)).toBe(true)
    expect(await appVerifier.verify(user!.passwordHash, 'old')).toBe(false)
    expect(user!.sessionVersion).toBe(1)
  })

  it('generates a different password each time', async () => {
    expect(await resetPassword(db, 'ada@example.com')).not.toBe(
      await resetPassword(db, 'ada@example.com'),
    )
  })

  it('returns null for an unknown e-mail', async () => {
    expect(await resetPassword(db, 'nobody@example.com')).toBeNull()
  })

  it('lists users', async () => {
    expect((await listUsers(db)).map((u) => u.email)).toEqual(['ada@example.com'])
  })
})
