# Contributing to Piston

Thanks for your interest! Piston is a small project: issues and pull requests are welcome, especially bug fixes, accessibility improvements and better prompts.

## Development setup

Follow [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md#2a-run-locally-development). In short:

```bash
cp .env.example .env            # then set ANTHROPIC_API_KEY and NUXT_SESSION_PASSWORD
bun install
docker compose -f docker-compose.dev.yml up -d
bun run db:migrate && bun run db:seed
bun dev
```

## Repository layout

```
apps/web/            Nuxt 4 app: Vue pages (app/) and the HTTP API (server/)
  app/pages/         One file per route (/cv, /offres, /candidatures...)
  app/composables/   useGeneration(): streams a Claude generation over SSE
  server/api/        One route per file, method suffix (offers.post.ts)
  server/utils/      Auto-imported server helpers (db, auth, Claude, SSE)
  server/middleware/ Auth guard for /api/* and the daily generation limit
  test/server/       API route tests (Claude mocked, in-memory Postgres)
packages/db/         Drizzle schema, SQL migrations, seed and invite scripts
packages/prompts/    Claude system prompts, one pure function per feature
packages/shared/     Zod schemas and TypeScript types shared by client and server
```

The packages are imported as `@piston/db`, `@piston/prompts` and `@piston/shared`. They ship TypeScript source directly (no build step); Nuxt bundles them.

## Scripts

Run from the repository root:

| Command               | What it does                                                            |
| --------------------- | ----------------------------------------------------------------------- |
| `bun dev`             | Starts the Nuxt dev server with hot reload                              |
| `bun run lint`        | ESLint + TypeScript type checking in every workspace                    |
| `bun run test`        | Every Vitest suite (prompts, database, API routes, client utils)        |
| `bun run format`      | Prettier on the whole repository                                        |
| `bun run build`       | Production build of the app                                             |
| `bun run db:generate` | Generates a SQL migration after a change in `packages/db/src/schema.ts` |
| `bun run db:migrate`  | Applies pending migrations to `DATABASE_URL`                            |
| `bun run db:seed`     | Inserts the demo user and sample resume                                 |
| `bun run db:invite`   | Prints a new invitation link                                            |

Tests do not need Docker or an API key: the database is an in-memory PostgreSQL ([PGlite](https://pglite.dev)) with the real migrations applied, and the Anthropic SDK is mocked.

## Conventions

- **Language.** Code, comments, commit messages and documentation are in English. Everything the user sees (UI, API error messages, Claude's answers) is in French, addressing the user as « tu ».
- **TypeScript strict**, no `any`. Domain types and request schemas come from `@piston/shared`.
- **One route, one file, one responsibility.** Every route validates its input with a Zod schema from `@piston/shared` and scopes every query to the logged-in user. Business logic longer than ~30 lines goes to `server/utils/`.
- **Prompts** live in `packages/prompts/src/<kind>.ts` as pure `(ctx) => string` functions. Changing a prompt changes its snapshot: review the diff in `__snapshots__`, then update it with `bun run test -- -u` in `packages/prompts`.
- **Database changes**: edit the schema, run `bun run db:generate`, commit the generated SQL file.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
- A Husky pre-commit hook runs Prettier on staged files. CI runs lint, tests and a Docker build on every push.

## Pull requests

1. Keep a PR focused on one change.
2. Make sure `bun run lint` and `bun run test` pass.
3. Add or update tests: every `generate/*` route, every prompt and every state change of an application are tested.
4. If you make a choice that is not obvious, add a short entry to [docs/DECISIONS.md](docs/DECISIONS.md).
