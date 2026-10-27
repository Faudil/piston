/**
 * Administration of accounts from the command line.
 *
 *   bun run user:list
 *   bun run user:reset-password <email>
 *   bun run user:make-admin <email>
 *   bun run user:revoke-admin <email>
 *
 * In production, the same file is bundled into the image as /app/cli/user.js:
 *
 *   docker compose exec web bun cli/user.js list
 *   docker compose exec web bun cli/user.js reset-password <email>
 *   docker compose exec web bun cli/user.js make-admin <email>
 *
 * Whoever can run this has shell access to the server, which is the trust
 * boundary for administration: the admin role (the /admin page) can only be
 * granted from here, or by another admin.
 */
import { createDb } from './client'
import { listUsers, resetPassword, setAdminRole } from './admin'

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
      const role = row.isAdmin ? '  [admin]' : ''
      console.log(`${row.createdAt.toISOString().slice(0, 10)}  ${row.email}  (${row.name})${role}`)
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
  } else if ((command === 'make-admin' || command === 'revoke-admin') && email) {
    const isAdmin = command === 'make-admin'
    if (await setAdminRole(db, email, isAdmin)) {
      console.log(
        isAdmin
          ? `${email} is now an admin: « Administration » appears in their menu (/admin).`
          : `${email} is no longer an admin.`,
      )
    } else {
      console.error(`No user with the e-mail ${email}.`)
      process.exitCode = 1
    }
  } else {
    console.error(
      'Usage: user list | user reset-password <email> | user make-admin <email> | user revoke-admin <email>',
    )
    process.exitCode = 1
  }
} finally {
  await db.$client.end()
}
