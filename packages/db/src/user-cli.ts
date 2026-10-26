/**
 * Administration of accounts from the command line.
 *
 *   bun run user:list
 *   bun run user:reset-password <email>
 *
 * In production, the same file is bundled into the image as /app/cli/user.js:
 *
 *   docker compose exec web bun cli/user.js list
 *   docker compose exec web bun cli/user.js reset-password <email>
 *
 * Whoever can run this has shell access to the server, which is the trust
 * boundary for administration (there is no admin role in the app).
 */
import { createDb } from './client'
import { listUsers, resetPassword } from './admin'

// In the container DATABASE_URL (from .env) points to localhost; the app's own
// NUXT_DATABASE_URL is the one that works there.
const url = process.env.NUXT_DATABASE_URL || process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const [command, email] = process.argv.slice(2)
const db = createDb(url, { max: 1 })

try {
  if (command === 'list') {
    const rows = await listUsers(db)
    for (const row of rows) {
      console.log(`${row.createdAt.toISOString().slice(0, 10)}  ${row.email}  (${row.name})`)
    }
    console.log(`${rows.length} user(s)`)
  } else if (command === 'reset-password' && email) {
    const password = await resetPassword(db, email)
    if (password === null) {
      console.error(`No user with the e-mail ${email}.`)
      process.exitCode = 1
    } else {
      console.log(`New temporary password for ${email.trim().toLowerCase()} (shown once):`)
      console.log(password)
      console.log(
        'Give it to the user, who should change it in « Mon compte ». All sessions were closed.',
      )
    }
  } else {
    console.error('Usage: user list | user reset-password <email>')
    process.exitCode = 1
  }
} finally {
  await db.$client.end()
}
