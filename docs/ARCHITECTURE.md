# Architecture

A map of the code for readers. For the _why_ behind non-obvious choices see [DECISIONS.md](DECISIONS.md); for running the project see [GETTING_STARTED.md](GETTING_STARTED.md).

```
Browser ── page (Vue) ──▶ composable / $fetch ──▶ Nitro route ──▶ server util ──┬─▶ PostgreSQL (Drizzle)
   │                                                (zod + session)             └─▶ Claude / Tavily
   │                                                                                 (only via the usage ledger)
   └── Web Worker: @piston/cv-render (live CV preview)
```

## Monorepo

| Path                 | Role                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/web`           | The Nuxt 4 app: Vue pages (`app/`) and the HTTP API (`server/`)                                      |
| `packages/shared`    | Zod schemas and types shared by client, API and prompts, plus the pure CV logic (operations, checks) |
| `packages/db`        | Drizzle schema, SQL migrations, seed and invite scripts, the PGlite test database                    |
| `packages/prompts`   | Claude system prompts: one pure function per feature, snapshot-tested                                |
| `packages/cv-render` | The CV renderer (block engine on pdfmake) and the Word exporter                                      |

The packages ship TypeScript source; Nuxt bundles them, there is no build step. `@piston/shared` is the contract: a request body, a stored output and a Claude structured-output format are all the same Zod schema.

## Request lifecycle

1. **Page.** A file in `app/pages/` renders on the server (SSR) and then in the browser. Data is read with `useFetch` (SSR-friendly) or mutated with `$fetch`. `app/middleware/auth.global.ts` redirects anonymous visitors to `/login`.
2. **API route.** One file per route and method in `server/api/` (`offers.post.ts`, `cv-documents/[id].patch.ts`). Before any route runs, `server/middleware/auth.ts` rejects `/api/*` calls without a valid session, except an explicit allow-list. A route does, in order: `requireUser(event)`, `readValidatedBody(event, zodValidator(Schema))` (the schema comes from `@piston/shared`), then calls a util. Failures are `createError({ statusCode, message })` with a French message.
3. **Server util.** Logic longer than a few lines lives in `server/utils/<topic>.ts`. Nitro auto-imports everything exported there (no barrels, no imports needed in routes). Every query is scoped to the logged-in user, so someone else's id is a 404.
4. **Database or provider.** Postgres through Drizzle (`useDb()`). Claude and Tavily are never called directly: `usage.ts` reserves the call in the `api_usage` ledger first (per-user and global daily caps, monthly budget; a French 429/503 when a limit is hit) and settles it with the real token counts afterwards. `claude.ts` and `tavily.ts` are the only files that talk to the providers.

In tests, `apps/web/test/server/setup.ts` stands in for Nitro's auto-imports so routes can be called in-process (see `helpers.ts`).

## Where each feature lives

| Feature                  | Pages                                  | API (`server/api`)                                         | Logic                                                                                                      |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Auth, invitations        | `login`, `invite/[token]`              | `auth/*`, `invites*`, `account*`                           | `auth.ts`, `throttle.ts`, `account.ts`                                                                     |
| Resume profiles, review  | `cv/index`                             | `profiles*`, `resumes*`, `generate/resume-review`          | `profiles.ts`, `resumes.ts`; `prompts/resume_review`                                                       |
| Offers, analysis         | `offres/*`                             | `offers*`, `generate/offer-analysis`, `offers/import-url`  | `import-offer.ts`; `prompts/offer_analysis`                                                                |
| Cover letters            | `offres/[id]`, `lettres`, `impression` | `generate/cover-letter`, `letters`, `generations/[id]`     | `cover-letter.ts`, `letter-pdf.ts`; `components/letters/`                                                  |
| Applications (kanban)    | `candidatures/*`                       | `applications*`                                            | `applications.ts`                                                                                          |
| Search leads, web search | `pistes`                               | `generate/search-leads`, `jobs/search`                     | `tavily.ts`                                                                                                |
| CV builder               | `cv/nouveau`, `cv/editeur/[id]`        | `cv-documents/**`, `generate/cv-draft`, `generate/cv-edit` | `cv-documents.ts`, `cv-revisions.ts`, `cv-ai.ts`, `cv-pdf.ts`, `cv-docx.ts`, `cv-share.ts`, `cv-assets.ts` |
| Shared CV links          | `partage/[token]`                      | `partage/*`, `cv-documents/[id]/share*`                    | `cv-share.ts`                                                                                              |
| History, usage           | `historique`, `compte`                 | `generations*`, `usage`                                    | `usage.ts`                                                                                                 |

Page-level state lives in the page; reusable pieces are components (`app/components/`), composables (`app/composables/`, stateful, `use*`) and plain helpers (`app/utils/`, pure).

## Streaming a generation (SSE)

All Claude features except small one-off calls go through the same pipeline:

1. The browser calls `useGeneration(kind)` (`app/composables/useGeneration.ts`), which POSTs to `/api/generate/<kind>` with `fetch` and reads the response body as a stream (`EventSource` is GET-only).
2. The route validates the body, loads the user's resume/offer, builds the prompt from `@piston/prompts`, and returns `streamGeneration(event, spec)` (`server/utils/generation.ts`).
3. `streamGeneration` reserves the call in the usage ledger, opens an h3 event stream, and streams Claude's answer: `delta` events carry the text as it is written.
4. For structured kinds the browser parses the partial JSON on the fly (`app/utils/partial-json.ts`), so scores and lists fill in progressively.
5. When Claude finishes, the output is validated with the kind's Zod schema, saved as a row of `generations`, the ledger is settled, and a single `done` event carries the saved generation. Failures send an `error` event with a French message. If the browser disconnects, the Claude stream is aborted and the ledger records `aborted`.

The event types are defined in `packages/shared/src/sse.ts`; the system prompt and the resume are cache breakpoints (see README).

## The CV engine: one renderer, two hosts

A CV is data (`CvContent`, `CvDesign`, a template id), never HTML. `@piston/cv-render` turns it into a pdfmake document through a block engine, and the same code runs in two places:

- **In the browser**, inside a Web Worker (`app/workers/cv-render.worker.ts`, protocol in `cv-render-protocol.ts`, driven by `useCvRenderWorker`). Typing re-renders the preview off the main thread; pdfmake and the fonts load lazily.
- **On the server** (`server/utils/cv-pdf.ts`) for downloads, « save as version » and share links, with the fonts as Nitro server assets.

The preview is therefore the downloaded file. Templates and design tokens are data in `@piston/shared` (`cv-templates.ts`, `cv-design.ts`); the Word export (`@piston/cv-render/docx`) shares the same model.

Claude never rewrites a CV. It returns **typed operations** on item ids (`@piston/shared`, `cv-operations*.ts`):

| File                        | Responsibility                                                          |
| --------------------------- | ----------------------------------------------------------------------- |
| `cv-operations-schema.ts`   | Operation schemas, the flat wire format sent to Claude, lenient parsing |
| `cv-operations-apply.ts`    | Pure functions that apply an operation (never throw, return a reason)   |
| `cv-operations-describe.ts` | French descriptions of an operation for the review UI                   |
| `cv-diff.ts`                | Word-level diff shown in the review                                     |

The user accepts or rejects each operation in the browser; accepted ones are applied with `applyCvOperations` and saved with `PATCH /api/cv-documents/:id`, which also records a revision (`cv-revisions.ts`). Optimistic concurrency (`updatedAt`) protects against two tabs overwriting each other.

## Data model in one paragraph

`users` own `resume_profiles` (one per specialty) with `resumes` (versions), `job_offers`, `applications` (+ status history), `generations` (every stored Claude output, typed by `kind`), `cv_documents` with their `cv_document_revisions` and `cv_document_assets`, `cv_share_links`, and the `api_usage` ledger (survives account deletion). The schema is `packages/db/src/schema.ts`.
