import { randomInt } from 'node:crypto'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'

/**
 * Hashes a password exactly like nuxt-auth-utils' `hashPassword()` (the same
 * @adonisjs/hash scrypt driver with its default options), so the app can verify
 * it at login. Used by the seed and by the user CLI, which run outside Nuxt.
 */
export function hashPassword(password: string): Promise<string> {
  return new Hash(new Scrypt({})).make(password)
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789' // no look-alikes (0/O, 1/l/I)

/** A random temporary password of 20 characters (about 115 bits), safe to read aloud or paste. */
export function generatePassword(length = 20): string {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
}
