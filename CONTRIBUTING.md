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
  app/workers/       Web Workers (the CV preview renderer)
  server/utils/      Auto-imported server helpers (db, auth, Claude, SSE, CV documents and PDFs)
  server/middleware/ Auth guard for /api/* and the daily generation limit
  test/server/       API route tests (Claude mocked, in-memory Postgres)
packages/cv-render/  CV renderer (pdfmake block engine), its fonts and their build script
packages/db/         Drizzle schema, SQL migrations, seed and invite scripts
packages/prompts/    Claude system prompts, one pure function per feature
packages/shared/     Zod schemas and TypeScript types shared by client and server
```

The packages are imported as `@piston/cv-render`, `@piston/db`, `@piston/prompts` and `@piston/shared`. They ship TypeScript source directly (no build step); Nuxt bundles them.

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

## Adding a CV template

A CV template is **data**: a layout and a style for each block, with default design tokens. The block engine of `@piston/cv-render` draws it, in the browser (the editor's preview, a Web Worker) and on the server (downloads), so the preview is always the downloaded PDF.

1. Add the id to `cvTemplateIds` and an entry to `cvTemplates` in `packages/shared/src/cv-templates.ts`. Copy an existing entry and change:
   - `label`, a one-line French `description`, `category` (`ats`, `moderne`, `creatif`, `une-page`), `atsLevel` (`optimal` for one column and standard headings, `bon` for minor risks such as icons or a header band, `limite` for columns) and `atsNote` (shown by the live checks, or `null`);
   - `defaults`: every design token — `layout`, `palette` (`#rrggbb`, or `{ tint: 0.9 }` for a tint of the primary color that follows the user's accent), `fontPairing`, `fontSize` (0), `lineHeight`, `spacing`, `margins`, `headerStyle`, `sectionTitleStyle`, `itemStyle`, `bulletStyle`, `skillStyle`, `languageStyle`, `showIcons`. The ids and what they look like are documented in `packages/shared/src/cv-design.ts`;
   - `typography`: body, name and title sizes in points, the side column's width, and `sideSections` (sections placed in the side column by default in two-column layouts);
   - optionally `sectionOrder`, a recommended order of the sections applied when a document is created with the template (« Étudiant »: education first).

   Twelve templates ship today; spread new ones over the categories and keep the ATS claim honest (two columns are never `optimal`, `limite` needs an `atsNote`; `packages/shared/test/cv-templates.test.ts` checks both).

2. Render it: `bun --bun vitest run` in `packages/cv-render` renders every template with the demo CV (`cvSampleContent()`), a two-page CV, a nearly empty one, a photo and very long strings (`longContent()`, `nearlyEmptyContent()`, `stressContent()` in `test/fixtures.ts`). To look at it, write the PDF of `renderPdf(sampleInput('<id>', {}, content), {}, engine)` (see `test/helpers.ts`) to a file, rasterize it (`pdftoppm -png -r 70 file.pdf out`) and check the page breaks, alignment and contrast: text on colored areas must reach 4.5:1 (`contrastRatio`, `ensureContrast` in `cv-colors.ts` do the arithmetic; the renderer already darkens or lightens the accent used as text).
3. Keep the reading order sensible: an ATS reads the text in the order it is drawn. Layouts already put the name first; the tests check it for every layout.

The gallery (real thumbnails rendered in the browser from the sample CV), the design panel, the live checks, the AI prompt's template catalog and the API validation pick the template up from `cvTemplates`; no component needs to change.

**A new style** (a header, a section title, a skill renderer…) is an id added to its enum in `cv-design.ts`, with a French label, and its drawing in `packages/cv-render/src/engine/` (`header.ts`, `sections.ts`; layouts in `src/render.ts`). Use the tokens (`t.size`, `t.space()`, `t.colors`, `t.fonts`) rather than numbers, so the design controls keep working, `clean()` on every user string (it removes characters the fonts cannot print), `linkTarget()` for links (web, e-mail and phone only), and `tagBox()` on the nodes the editor should be able to locate (click-to-edit). Add the style to the « renders every style » test (it loops over the enums) and keep section titles in a single text run: runs of different sizes make PDF text extraction split the word.

**A new font pairing** is an entry in `cvFontPairings` (`cv-design.ts`). A new family also needs its files: add it to `scripts/build-fonts.sh` (OFL fonts only, with their license) and to `cvFontFamilies`, then run the script (it needs `pip install fonttools`).

A few pdfmake details save time: a full-page background needs `absolutePosition`, column margins are ignored (put the margin on a nested stack), negative margins let a band bleed to the page edges, and nodes inside `unbreakable` blocks report wrong positions (titles are kept with their content by `pageBreakBefore` instead).

## Pull requests

1. Keep a PR focused on one change.
2. Make sure `bun run lint` and `bun run test` pass.
3. Add or update tests: every `generate/*` route, every prompt and every state change of an application are tested.
4. If you make a choice that is not obvious, add a short entry to [docs/DECISIONS.md](docs/DECISIONS.md).
