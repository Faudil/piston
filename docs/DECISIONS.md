# Design decisions

Choices that the original brief left open, or where the brief had to be adapted to the current versions of the libraries. Each entry says what was decided and why. Newest concerns go at the bottom of their section.

## Stack and tooling

**Nuxt UI v4 instead of v3.** The brief asked for Nuxt UI 3. Nuxt UI 3 targets Nuxt 3; v4 is its direct successor for Nuxt 4, keeps the same component API, and ships the dashboard components (sidebar, panels, navbar) for free. Using v3 on Nuxt 4 would mean pinning an older major for no benefit.

**TypeScript 5.9, not 7.** TypeScript 7 (the native port) is out, but `vue-tsc` and parts of the Vue tooling still rely on the JavaScript compiler API. TypeScript is pinned to `~5.9` until the Vue tooling supports 7.

**Zod 4, imported as `import * as z from 'zod'`.** The named import `import { z } from 'zod'` resolved to `undefined` during Vite SSR in the dev server. The namespace import is also the style recommended by the Zod 4 docs.

**Workspace packages ship TypeScript source.** `@piston/db`, `@piston/prompts` and `@piston/shared` export `.ts` files directly and have no build step. Nuxt (Vite and Nitro) compiles them as part of the app, and Bun runs the database scripts natively. One fewer build to cache and keep in sync.

**`drizzle-orm` is a dependency of `@piston/db` only.** The app imports query operators (`eq`, `and`...) from `@piston/db`, which re-exports them. Bun's isolated installs could otherwise resolve two copies of `drizzle-orm` (with different peer sets), and the schema objects of one copy are not understood by the other.

**Nuxt warns about the Node.js version under Bun.** Bun reports a Node.js-compatible version that Nuxt's check does not recognize, so Nuxt prints a warning on start. It is harmless and not a lint or test warning.

## Configuration

**Environment variable names.** The brief names the variables `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` and `DATABASE_URL`. Nuxt only overrides `runtimeConfig` at runtime from variables prefixed with `NUXT_`. So `.env` keeps the names from the brief (they are also read by the scripts in `packages/db`), `nuxt.config.ts` reads them when the config is evaluated (`bun dev`), and the production `docker-compose.yml` maps them to `NUXT_ANTHROPIC_API_KEY`, `NUXT_CLAUDE_MODEL`, `NUXT_DATABASE_URL`, built from the `POSTGRES_*` values. The compose file contains references only, never values.

**A single `.env` at the repository root**, shared by the dev server (`nuxt dev --dotenv ../../.env`), the database scripts (`bun --env-file`) and Docker Compose.

## Authentication

**Bootstrapping the first account.** Sign-up requires an invitation, and invitations are created by logged-in users: a fresh install has nobody to invite the first user. `invites.createdBy` is therefore nullable. In development, `bun run db:invite` prints a link; in production, the server logs an invitation link at startup while the `users` table is empty.

**API protection lives in a server middleware, page protection in a route middleware.** `server/middleware/auth.ts` rejects every `/api/*` request without a session except an explicit allow-list (login, register, invitation check, health, the nuxt-auth-utils session endpoint). Pages are guarded by `app/middleware/auth.global.ts`, which runs during SSR and on client-side navigation. A server middleware cannot see client-side navigations, so it alone could not protect pages.

**Same response time for unknown e-mail and wrong password.** Login always runs a scrypt verification, against a dummy hash when the e-mail is unknown, so response timing does not reveal which e-mails have an account.

**Invitations are consumed atomically.** Registration marks the invitation as used with a single conditional `UPDATE ... WHERE used_at IS NULL AND expires_at > now() RETURNING`, inside the same transaction as the user insert, so two people cannot use the same link concurrently.

## Data model

**`applications.outcome`.** The brief lists the closed column as « terminée (acceptée / refusée) » but the status enum has a single `closed` value. A nullable `outcome` column (`accepted` | `rejected`) records how a closed application ended; it is reset when the application leaves `closed`.

**One application per offer, enforced by the database.** `POST /api/applications` answers 409 when the offer is already tracked, and a unique index on `applications.job_offer_id` closes the race between two simultaneous requests.

**One current resume per user, enforced by the database.** A partial unique index (`WHERE is_current`) guarantees it even if two requests race.

**Cover letters are stored as paragraphs.** `generations.output` for a letter is `{ paragraphs: string[] }`, which makes "regenerate this paragraph" a matter of replacing one array item.

**Generation history is append-only, except for letter edits.** Regenerating a paragraph creates a new `generations` row pointing to its parent (`inputRefs.parentGenerationId`), so the history shows every Claude call and its token cost. Manual edits of a letter overwrite the paragraphs of the edited row, since they are not Claude output.

**`inputTokens` includes cached tokens.** It stores `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`, i.e. the full prompt size, which is what a user expects to see. The split is not needed by the UI.

## API

**Validation errors are readable.** Routes validate with `zodValidator(Schema)` (`server/utils/validation.ts`) rather than passing `Schema.parse` to h3, which would return Zod's raw JSON issue list as the message. The first issue becomes the message, in French thanks to Zod's French locale (`z.config(z.locales.fr())` in `@piston/shared`), so forms and the API speak the same language.

**A missing API key is a clear 503**, with a French message for the user and a log line for the administrator, rather than a 500.

**PDF detection by content.** An uploaded file is accepted as a PDF only if it starts with `%PDF-`; the MIME type and extension are chosen by the client. Oversized uploads are refused from their `Content-Length` before the body is read, and checked again after. Page separators inserted by pdf-parse are removed so an imported resume looks like a pasted one. A PDF without a text layer (a scan) gets an explicit message asking to paste the text.

**pdf-parse is loaded lazily and its runtime files are traced explicitly.** pdf.js loads a native canvas binding (`@napi-rs/canvas`) and its worker script with dynamic imports that Nitro's file tracer cannot follow, so `nuxt.config.ts` lists them in `nitro.externals.traceInclude`. Without this, PDF import works in development and fails in the Docker image. pdf-parse is also imported on first use, so a problem there breaks PDF import only, never the server start.

**The imported PDF is kept.** The extracted text feeds Claude, but users also want their original file back (layout, fonts) to apply with. The bytes are stored in a nullable `bytea` column `resumes.source_pdf`, capped at 5 MB by the import route (`LIMITS.maxPdfBytes`). Postgres rather than disk or object storage: the existing backups cover it, there is no second place to secure, and the row is deleted with the resume or, by cascade, with the user. List queries never select the column (`resumeColumns` in `server/utils/resumes.ts` swaps it for a `hasPdf` boolean), so `GET /api/resumes` stays light. `GET /api/resumes/:id/download` serves the PDF as an attachment, or the pasted text as `.txt` when there is no file; the filename is sent both ASCII-sanitized and as RFC 5987 `filename*`.

**Account export and deletion.** `GET /api/account/export` returns all of a user's rows as JSON, without the password hash and without PDF bytes (the text is there, the files stay downloadable one by one). `DELETE /api/account` requires the exact account e-mail in the body and relies on foreign-key cascades; invites the user created are kept with `created_by` set to null. Changing the password re-verifies the current one.

**Deleting the current resume promotes the newest remaining one**, in the same transaction, so a user with versions always has a current one. Generations keep pointing at the deleted id (history is append-only).

**Letter export is the browser's.** `.txt` is built client-side; the PDF is the print view (`/impression/lettre/:id`, no app chrome, print stylesheet, `window.print()` on load) saved through the browser's « Enregistrer au format PDF », which avoids a server-side PDF renderer.

**Deleting an offer keeps its generations.** The history is append-only; a generation simply loses its link to the offer page.

## Claude integration

**Prompts are written in English and ask for French answers.** The whole codebase is in English; the prompts are code. Each one states explicitly that Claude answers in French and addresses the user as « tu » (the cover letter uses « vous » towards the recruiter).

**Counts and ranges live in schema descriptions, not Zod constraints.** "Exactly 5 strengths" or "score from 0 to 10" are written in the field descriptions sent with the structured output schema. Structured outputs support only a subset of JSON Schema, and a review with six strengths is better shown than rejected.

**Effort `medium`.** Claude Sonnet 5.5 defaults to `high` effort. The tasks are well specified single calls and most users are on a phone, so `medium` gives faster answers; it is set explicitly in `server/utils/generation.ts`.

**Server-side refusal fallback.** Generations use the `fallbacks: "default"` server-side fallback (beta `server-side-fallback-2026-07-01`): if the model declines for policy reasons, the API retries on its default fallback model within the same call. The model that actually answered is stored in `generations.model`.

**Prompt caching breakpoints.** The system prompt and the `<cv>` block each carry a `cache_control` breakpoint; the variable part (offer, tone, highlights, instruction) comes after them in a separate text block. Cache entries are per feature, since each feature has its own system prompt.

**Closing tags are escaped.** Text pasted into `<cv>` or `<offre>` has any `</cv>` / `</offre>` neutralized, so a document cannot close its own tag and inject text outside it. The prompts also state that the tag contents are data, never instructions.

**Structured results render while streaming.** Structured outputs stream as raw JSON. `app/utils/partial-json.ts` closes open strings, arrays and objects so the UI can render the partial result progressively, instead of showing raw JSON or a spinner.

**The stream is aborted when the browser disconnects**, so a user leaving the page does not keep consuming output tokens. An aborted generation is not saved.

**The offer sent to Claude starts with its title and company**, because pasted job ads often omit them.

**An analysis is never paid for twice by accident.** After creating an offer the app opens it with `?analyze=1`; the flag is removed from the URL immediately and the analysis only starts if the offer has none yet, so a reload does not start another one.

**Regenerating a paragraph keeps the user's other edits.** The full letter and the single paragraph use two separate `useGeneration` instances; when the paragraph arrives, only that paragraph is replaced on screen. Leaving the page or regenerating the whole letter with unsaved edits asks for confirmation.

**Cover letter templates, corrections and application notes.** The five templates (classique, vous-moi-nous, percutante, reconversion, e-mail) are instructions in the system prompt, not stored texts to fill in: every letter is still written from the resume and the offer, and adding a template is one entry in a map. Their word ranges live in `@piston/shared` (`coverLetterWordTargets`) so the prompt and the editor's counter agree. Corrections asked by the user (« plus court », « mentionne mon stage chez X ») are append-only like paragraph rewrites: the revised letter is a new generation with `parentGenerationId` and `revisionInstructions` in `inputRefs`, so every version can be reopened. The corrections and the current letter go inside `<corrections>` and `<lettre>` tags (closing tags escaped) and are framed as the user's wishes about the letter, which never override the honesty rules: a correction asking to add experience missing from the resume is ignored silently. A letter written from an application gets the application's notes (recruiter's name, referral...) in the request block, inside escaped `<notes>` tags and stated as data; they stay out of the system prompt so it remains cacheable. The application must belong to the user and be the application of the offer (404 / 400). Letters of an application are found with `inputRefs->>'applicationId'`, which avoids a new column for a list that only one page reads.

**Rate limit over a rolling 24 hours.** The limit counts rows in `generations` created in the last 24 hours. It needs no extra storage, survives restarts, and avoids choosing a time zone for "per day".

## Web search (Tavily, optional)

**Tavily through plain `fetch`.** Two endpoints (`/search`, `/extract`) do not justify an SDK dependency. A single `tavilyRequest()` in `server/utils/tavily.ts` handles the key, the 15 s timeout, logging (status and `request_id`) and the mapping of Tavily errors to French messages: missing or invalid key and exhausted quota are 503, rate limit is 429, anything else is 502. The feature is optional: without `TAVILY_API_KEY`, `/api/features` reports `webSearch: false` and the routes answer 503.

**Searches are restricted to French job boards.** A general web search mostly returns career advice articles. `include_domains` lists Welcome to the Jungle, Indeed, HelloWork, APEC, France Travail, LinkedIn, JobTeaser, Cadremploi and Meteojob, with `country: france` and `time_range: month` so results are recent. Basic depth, 10 results: one Tavily credit per search.

**Imported pages are cleaned by Claude.** A page extracted as markdown is full of navigation, cookie banners and other offers. One non-streaming structured call (`messages.parse`, effort `low`) keeps only the ad and says whether the page is an offer at all. The page is capped at 60 000 characters before it is sent, wrapped in `<page>` tags with the closing tag escaped, and treated as data. The result is returned to prefill the form and is not stored, so this call counts toward the Tavily limit and not toward the daily generations.

**In-memory limit of 50 Tavily calls per user and 24 hours.** It only protects the owner's Tavily credits. The counters live in `server/utils/web-limit.ts` and reset on restart, which is acceptable for a single-process app used by about ten friends and avoids a table for a soft guard.

**URLs are checked before import.** Only http(s) URLs with a dotted public-looking hostname are accepted (no localhost, bare hostnames, private IPv4 ranges, IPv6 literals, credentials in the URL). Tavily, not this server, fetches the page, so this is hygiene rather than a full SSRF defence.

## Frontend

**Password forms are disabled until hydration.** Before Vue takes over the page, pressing Enter in the login form would trigger a native GET submission and put the password in the URL. The submit buttons of the login and sign-up forms stay disabled until the component is mounted (`useHydrated()`).

**Kanban on a phone.** Columns scroll horizontally with snap points below the `xl` breakpoint and form a five-column grid above. Dragging starts after a 150 ms touch delay so a swipe still scrolls the board. Every card also has « déplacer » buttons, so the board works with a keyboard or a screen reader. Failed moves are rolled back with an error toast.

**Score colors.** Match scores are green from 70, orange from 40, red below.

## Testing

**API routes are tested in-process, without a server.** Nitro auto-imports helpers into route files. Under Vitest, `apps/web/test/server/setup.ts` exposes the same names as globals (real h3 functions and server utils, plus test doubles for the session, runtime config, database and Claude), and routes are called through a real h3 app together with the production middleware. This keeps tests fast and lets them exercise the real handlers.

**In-memory PostgreSQL (PGlite) for tests.** Tests run the real migrations against PGlite, so SQL behavior (constraints, JSON columns, the partial unique index) is tested for real, with no Docker needed in CI.

**Tests run under the Bun runtime** (`bun --bun vitest run`). The Nuxt test environment (`@nuxt/test-utils`) gets a longer hook timeout, because booting it can be slow when Turborepo runs every workspace's tests at once.

**PDF import is tested with real pdf-parse** on tiny PDFs built by hand in the test, including one without a text layer.

**Password hashing is stubbed in route tests.** scrypt is deliberately slow and is nuxt-auth-utils' responsibility; route tests use a reversible fake to test our logic only.
