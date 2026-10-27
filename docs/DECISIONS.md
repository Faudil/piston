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

**API protection lives in a server middleware, page protection in a route middleware.** `server/middleware/auth.ts` rejects every `/api/*` request without a session except an explicit allow-list (login, register, access request, invitation check, health, the nuxt-auth-utils session endpoint). Pages are guarded by `app/middleware/auth.global.ts`, which runs during SSR and on client-side navigation. A server middleware cannot see client-side navigations, so it alone could not protect pages.

**Same response time for unknown e-mail and wrong password.** Login always runs a scrypt verification, against a dummy hash when the e-mail is unknown, so response timing does not reveal which e-mails have an account.

**An admin role, granted from the shell.** `users.is_admin` gates `/admin` and every `/api/admin/*` route. The server middleware rejects non-admins on that prefix, and each route calls `requireAdmin()` again; both read the flag from the database, never from the cookie. The cookie only carries it as a display hint, refreshed on every session fetch, so a role granted with `bun cli/user.js make-admin <email>` shows up without logging in again. The first admin can only come from the shell, the same trust boundary as password resets; admins can then promote others but cannot demote or delete themselves, so the last admin cannot lock everyone out by mistake.

**Access requests carry their own password.** Piston sends no e-mail, so an approval that mailed a link would need an SMTP setup for one feature. Instead the requester picks a password on `/demande`; it is hashed and kept in `access_requests` until review, and approval inserts the user with that hash. Rejection or approval erases the hash. The form answers the same whether or not the address already has an account or a pending request (no member enumeration), every call counts against a per-IP limit, and at most 30 requests may wait at once. A unique partial index (one pending request per e-mail) makes duplicate submissions a no-op. Login answers « en attente » only when the password matches the pending request.

**Invitations are consumed atomically.** Registration marks the invitation as used with a single conditional `UPDATE ... WHERE used_at IS NULL AND expires_at > now() RETURNING`, inside the same transaction as the user insert, so two people cannot use the same link concurrently.

## Data model

**`applications.outcome`.** The brief lists the closed column as « terminée (acceptée / refusée) » but the status enum has a single `closed` value. A nullable `outcome` column (`accepted` | `rejected`) records how a closed application ended; it is reset when the application leaves `closed`.

**One application per offer, enforced by the database.** `POST /api/applications` answers 409 when the offer is already tracked, and a unique index on `applications.job_offer_id` closes the race between two simultaneous requests.

**Resume profiles: a table, not a free-text tag.** A user applying in several fields (communication, digital marketing) keeps one CV per specialty. Profiles are rows of `resume_profiles` (name unique per user, one `is_default` per user enforced by a partial unique index), and every resume version belongs to one (`resumes.profile_id`, cascade). A tag on each version would have made renaming a specialty touch every version, allowed typos to split a CV in two, and left nowhere to store which profile is the default. Deleting a profile deletes its versions; if it was the default, the oldest remaining profile takes over. Deleting the last one is allowed: the user is back to the state of a new user, and the first resume added recreates « Principal ».

**One current resume per profile, enforced by the database.** Each profile has its own history and its own current version; a partial unique index on `profile_id` (`WHERE is_current`) guarantees it even if two requests race. Adding, switching or deleting a version only affects its profile.

**The offer chooses the CV, with a default fallback.** `job_offers.profile_id` is nullable (`ON DELETE SET NULL`): null means "the default profile", so offers follow a change of default, and offers whose profile is deleted fall back to it instead of breaking. Analyses and letters resolve the resume as: a given version id, else the current version of the given profile (the offer's for analyses and letters), else the current version of the default profile. The profile used is stored in `inputRefs.profileId`, which the CV and Pistes pages filter on (`GET /api/generations?profileId=`), and which lets the offer page warn that the analysis shown was made with another CV. Two French errors distinguish "no resume at all" from "this profile has no version yet".

**Existing resumes moved into « Principal ».** Migration `0003_resume_profiles` is hand-edited after `drizzle-kit generate`: it creates one default « Principal » profile per user who has resumes, backfills `resumes.profile_id`, only then sets it `NOT NULL`, swaps the "one current per user" index for "one current per profile" (safe: a user had at most one current resume), and adds `profileId` to the `inputRefs` of earlier generations from the profile of their resume. Users without resumes get no profile; it is created with their first resume. A database test applies the migrations up to the previous one, inserts data, then applies this one.

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

**Two models: Sonnet for judgment, Haiku for light work.** The resume review, the offer analysis, the search leads and the cover letters run on `CLAUDE_MODEL` (Claude Sonnet 5.5): they are what users rely on and what recruiters read. Importing an offer from a link, CV builder drafts (filing existing content into sections) and edit proposals, which the user accepts one by one, run on `CLAUDE_FAST_MODEL` (Claude Haiku 5.5, 20x cheaper per token and 10-15x cheaper per call on these tasks, measured on the same inputs with equivalent edits). Search leads stayed on Sonnet: on a nearly empty resume, Haiku proposed generic job titles where Sonnet declined to invent any. The list is `FAST_OPERATIONS` in `server/utils/claude.ts`; the usage ledger reserves and settles each call at its own model's price. Haiku has no server-side refusal fallback, so the `fallbacks` parameter is only sent to the main model. Setting `CLAUDE_FAST_MODEL` to the main model's id runs everything on one model.

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

**ATS compatibility is judged from the extracted text.** The app gives Claude the plain text of the resume, not its layout, so the resume review (`ats` in `ResumeReviewOutput`: 0-100 score, 6 to 10 status checks, summary) infers layout problems from their traces (jumbled line order, isolated fragments, odd glyphs as bullets) and must say "cannot be judged from the text" with a `warning` status instead of guessing. A made-up verdict on a layout Claude never saw would be worse than none. The offer analysis adds `atsMatch` (score, found keywords, missing keywords with an honest suggestion), because ATS filtering is per offer: the keywords a recruiter filters on depend on the ad. A missing keyword is never to be claimed without the experience: the suggestion is either a better wording of a real experience or advice to acquire the skill.

**Stored outputs predate new fields.** Generations saved before `ats` / `atsMatch` existed have neither in their JSON. Stored outputs are not migrated or re-validated on read, and the result components already take `Partial<...>`: the ATS blocks render only when the field is present (and progressively while streaming), so old history keeps displaying as before.

**Rate limit over a rolling 24 hours.** Per-user limits count over the last 24 hours rather than a calendar day: it survives restarts and avoids choosing a time zone for "per day". They are now computed from the usage ledger (see « Usage ledger and global caps »).

## CV builder

The full design (model, operations, templates, alternatives) is in [docs/design/cv-builder.md](design/cv-builder.md); these are the choices worth knowing when reading the code.

**PDFs are rendered by pdfmake.** (v1: in the server process; v2 renders the preview in the browser too, see below.) It is pure JavaScript, runs under Bun, embeds subsetted fonts, writes real text and links, and needs nothing in the Docker image (Nitro traces it; the fonts are server assets). Headless Chromium was rejected for its image size and memory, Typst for its 28 MB WASM module and a second template language. Renders are limited to two at a time per process.

**The preview is the PDF itself, drawn with pdf.js.** The renderer is the single source of truth: no HTML twin that would drift from the downloaded file. `<iframe>` was not an option because Chrome on Android downloads PDFs instead of showing them. (v1 followed the one-second autosave; v2 renders in a worker on every change.)

**WOFF fonts, vendored.** (v1: Inter, Lato and Source Serif 4, Latin subset; v2: ten pairings with Latin Extended, below.) fontkit cannot subset WOFF2 composite glyphs. Characters outside the subsets (emoji) are removed from the PDF and reported by a live check.

**Claude proposes typed operations on ids; the user accepts them one by one.** Edits target item and bullet ids, so any subset of a proposal applies cleanly, which index-based JSON Patch could not guarantee. The appliers are pure functions in `@piston/shared`, run in the browser and tested in the package.

**Claude writes a flat operation, the code uses a typed union.** The twelve-variant union, sent as the structured-output schema, was rejected by the API ("compiled grammar is too large"). Claude now fills one object whose fields are all present and null when unused, converted by `fromWire()`. Each operation is validated on its own and dropped if invalid, through a new lenient output mode of `streamGeneration` (`format` + `fromJson`).

**Documents are snapshotted, not diffed.** A revision is a full copy (a few KB), taken at creation, on accepted AI edits, restorations and template changes, after manual edits made before such a snapshot, and every 15 minutes of autosaving; 50 per document at most. Saves carry the `updatedAt` the client saw and get a 409 if another tab saved in between. Revisions are ordered by an identity column (`seq`), not by `created_at`: Postgres' `now()` is the transaction's start time, so the « manual changes » revision and the AI snapshot written by the same save share a timestamp, and the history came back in random order.

**Saving as a resume version stores the PDF and the text extracted from it.** Reviews, analyses and letters keep reading `resumes.raw_text` unchanged. The text comes from the PDF, not from the document, because that is what an ATS reads; the « Moderne » template puts the name above its two columns so it comes first in that text.

**Builder AI calls count toward the daily limit.** They are `generations` rows of kinds `cv_draft` and `cv_edit` (migration `0004` adds them to the enum) under `/api/generate/*`, so the usage ledger limits and the history cover them.

**Interview questions are fixed, not generated.** Six questions written once in `@piston/shared` cost no call, and one generation turns the answers into a draft. Facts the user states in the instruction box (« ajoute mon stage chez X ») may be added; nothing else may, and roles may not be inflated.

### CV builder v2 (see [docs/design/cv-builder-v2.md](design/cv-builder-v2.md))

**One renderer, in the browser and on the server.** The pdfmake templates moved to `@piston/cv-render`, a pure `render(document) → definition` plus `renderPdf`. The editor's preview runs it in a Web Worker on every change (150 ms debounce, latest request per channel wins) instead of fetching the server's PDF after each autosave; the server uses the same code for downloads and « Enregistrer comme version ». pdfmake (~1 MB) lives in the worker chunk only.

**Templates are data; the engine is blocks.** A template is a `CvTemplateMeta` in `@piston/shared` (category, ATS level, default tokens, typography): a layout and a style per block (header, section titles, items, bullets, skills, languages). The engine in `@piston/cv-render` draws any combination, so adding a template is a data entry and every design control works on every template. The three v1 templates were ported onto it and render almost identically.

**The design stores overrides, not values.** `CvDesign` holds only what the user changed; `resolveCvDesign(template, design)` fills the rest from the template. Switching template keeps the user's choices (an accent, a font) and takes the new template's look for everything else; « Réinitialiser » clears the overrides. v1 designs upgrade their accent and font to overrides, so they keep their look.

**Documents are upgraded on read, never migrated.** `CvContent` and `CvDesign` run `upgradeCvContent` / `upgradeCvDesign` before validating, so a v1 JSON document (stored, in a revision, sent by an old tab) parses as v2. The server reads every row through `readCvRow` and writes v2 on the next save. The upgrade is deterministic (v1 skills get ids derived from their group's id), so two reads of an unsaved v1 document agree and an AI proposal made on one applies to the other.

**Custom sections are `{ key: 'custom', customId }` entries.** Keeping a `key` on every `sections[]` entry, rather than a bare `{ customId }`, keeps `section.key` valid everywhere and lets TypeScript narrow. The title of a custom section lives in `custom[]`, not in its entry. New built-in sections start hidden, so upgraded documents do not suddenly list five empty sections.

**Content boxes come from pdfmake's own layout.** pdfmake 0.3 has no layout API, but it lays out the definition's node objects in place and records every line's position on them. The renderer tags nodes (`cvBox`) and reads the positions after rendering, so click-to-edit needs no pdf.js text matching. `unbreakable` blocks keep the positions of their trial layout, so titles are kept with their first item by `pageBreakBefore` instead.

**Fonts: Latin Extended, from Google Fonts' static instances.** Fontsource ships one file per subset, and pdfkit takes one file per style, so the files are built from Google Fonts' full static TTFs, subset to Fontsource's latin + latin-ext ranges with fontTools, as WOFF without hinting (script in `packages/cv-render/scripts`). Google's Lato is the old version without full Latin Extended (no ş, ř, ő), so the `lato` pairing uses **Carlito**, an OFL font drawn from Lato 2.0. One directory feeds both the server (Nitro server assets) and the browser (`/cv-fonts/`, public assets, 30-day cache). Text is NFC-normalized before printing, so decomposed accents pasted from macOS are not stripped.

**Photos are rows of `cv_document_assets`, not part of the document.** The document refers to an asset id; the bytes (≤ 2 MB, type sniffed from magic bytes) live in Postgres next to the document and are deleted with it, copied with it on duplication, and never sent to Claude. The renderer only embeds PNG and JPEG (pdfkit); the editor should upload JPEG.

**Design changes are proposals too.** `set_template` and `set_design` are operations like the content ones: reviewed one by one, never auto-applied, with readable French diffs and color swatches. They apply to the whole document state (`applyCvOperationToDocument`), not to the content, so the content-only `applyCvOperation` refuses them. They reuse the flat wire (`value`, `visible`, `fields`) instead of new fields: the API already rejected a bigger union once ("compiled grammar is too large"). Claude may only touch a subset of the design (palette primary, secondary and sidebar colors, fonts, styles, spacing, size, icons), not the body text color, the page format or the language.

**The template catalog is in the cached system prompt; the current design is not.** `cvDesignCatalog()` is generated from `cvTemplates`, sorted by id, so it is stable between calls and follows new templates without editing the prompt (the snapshot hides it). The user's design changes more often than their content, so it is sent in the request as `<cv_design>`, after the cached document block.

**Moving to a worse ATS reading is warned about, not forbidden.** A template or a layout with a worse ATS level (or a new second column) shows a warning on the proposal card: fine for a CV sent to a person, to avoid on job portals. The prompt tells Claude to say the same in its reason and to favor « optimal » templates when the user applies through portals.

**Coach issues come from three sources, one entry point.** Live checks (deterministic), the latest review's improvements and its ATS checks (stored generations, no new call) all end in `mode: 'fix'`, with the issue as data (`<probleme>`) and the target ids when the check knows them. A resume review is about a saved text version, linked to the document only through its profile, so the coach says when the review predates the saved version or later edits.

**« Compléter cette section » reuses the `cv_edit` kind.** The first step stores a proposal with `questions` and no operations, the second (with `answers`) a normal proposal. A new kind would need a pg enum migration for no behavior of its own, and both steps are edit proposals that count toward the daily limit.

**The English copy is made before it is translated.** `POST /api/cv-documents/:id/translate` duplicates the document with `language: 'en'`; the translation is then a reviewed proposal on the copy (`mode: 'translate'`, up to 80 operations, one per text). The original never changes and nothing is translated unseen.

**Twelve templates are data; the engine got only what they needed.** Smaller engine additions rather than per-template code: small-capital titles, a table-based timeline, contrast-safe colors and tags. Small capitals are one run of smaller spaced capitals: runs of mixed sizes made pdf.js extract « PROF I L », which an ATS would not read as « Profil ».

**Text colors are made readable, fills are not.** The accent is used as is for rules, bullets and fills, but as text it is darkened (on white) or lightened (on a dark side column) until 4.5:1, so any user color or palette stays legible. Choosing a palette writes three overrides; a custom accent writes the primary only and the template derives the light colors.

**A template's section order is applied at creation only.** « Étudiant » puts education and projects first when a document is created with it; switching template later never reorders the user's sections.

**Gallery thumbnails are rendered in the browser** by the same worker as the preview (first page, pdf.js canvas), with the built-in sample CV first and the user's own content when available; the sample thumbnails are cached in IndexedDB under a key that includes the template's data, so editing a template invalidates them.

**A design round, still data plus a few blocks.** Six templates (Portrait, Rivage, Direction, Impact, Éditorial, Géométrie) and a refresh of the twelve came with a handful of engine primitives rather than per-template code: two title styles (`sidehead`, `chip`) and four template-only typography settings (`photoScale`, `bandFill`, `titleCaps`, `ornament`). They are template-only, not design overrides, so the stored design schema and the AI operations did not change. Decorations are canvas in the page background: they never hold text, never move the reading order, repeat on every page, and use tints light enough (≥ 82 % towards white) for any text above them. In two-column layouts the photo moved from the side column's flow to the name's row, so the name stays the first text an ATS reads while the photo sits where designers put it. The gallery's sample has a drawn, generated silhouette photo (never a real face); plain templates (`photo: 'none'`) are shown without it.

## Web search (Tavily, optional)

**Tavily through plain `fetch`.** Two endpoints (`/search`, `/extract`) do not justify an SDK dependency. A single `tavilyRequest()` in `server/utils/tavily.ts` handles the key, the 15 s timeout, logging (status and `request_id`) and the mapping of Tavily errors to French messages: missing or invalid key and exhausted quota are 503, rate limit is 429, anything else is 502. The feature is optional: without `TAVILY_API_KEY`, `/api/features` reports `webSearch: false` and the routes answer 503.

**Searches are restricted to French job boards.** A general web search mostly returns career advice articles. `include_domains` lists Welcome to the Jungle, Indeed, HelloWork, APEC, France Travail, LinkedIn, JobTeaser, Cadremploi and Meteojob, with `country: france` and `time_range: month` so results are recent. Basic depth, 10 results: one Tavily credit per search.

**Imported pages are cleaned by Claude.** A page extracted as markdown is full of navigation, cookie banners and other offers. One non-streaming structured call (`messages.parse`, effort `low`) keeps only the ad and says whether the page is an offer at all. The page is capped at 60 000 characters before it is sent, wrapped in `<page>` tags with the closing tag escaped, and treated as data. The result is returned to prefill the form and is not stored, so this call is recorded in the usage ledger (one Tavily call plus one Claude call) and not in `generations`.

**Tavily is limited to 50 calls per user and 24 hours, through the usage ledger** (see « Usage ledger and global caps » below), not in memory: counters survive restarts and a global cap sits on top.

**URLs are checked before import.** Only http(s) URLs with a dotted public-looking hostname are accepted (no localhost, bare hostnames, private IPv4 ranges, IPv6 literals, credentials in the URL). Tavily, not this server, fetches the page, so this is hygiene rather than a full SSRF defence.

## Usage ledger and global caps

The app is public and the owner pays the Anthropic and Tavily bills, so spam must not be able to overcharge him. Per-user limits are not enough (accounts multiply, and counting successful `generations` misses aborted or failed calls), so every paid call goes through one ledger.

**One ledger table, `api_usage`.** One row per Claude or Tavily call: user, provider, operation, model, token counts, Tavily credits, estimated cost in micro-dollars, status (`reserved`, `done`, `failed`, `aborted`). All limits are computed from it: per user over a rolling 24 h (30 Claude calls, 50 Tavily calls), globally over a rolling 24 h (`CLAUDE_GLOBAL_DAILY_LIMIT`, `TAVILY_GLOBAL_DAILY_LIMIT`), and globally over the calendar month (UTC): estimated Claude cost against `CLAUDE_MONTHLY_BUDGET_USD`, Tavily credits against `TAVILY_MONTHLY_CREDITS`. Daily limits answer 429, the monthly budget 503, with French messages.

**Reserve, then settle.** `reserveUsage()` runs before the call and inserts a `reserved` row holding a conservative estimate: 30k input + 8k output tokens at the configured model's price for a generation (20k + 4k for the offer import cleanup), 1 credit for a Tavily call. `settleUsage()` replaces the estimate with the real usage (`finalMessage().usage`, Tavily's `usage.credits`). A call that is aborted (the client left) or fails keeps its estimate, so looping « start then abort » is no longer free. A reservation whose call never left the server (e.g. no API key, a failed page fetch before the Claude call) is settled at zero. If the process dies mid-call the row simply stays at its estimate.

**Advisory lock.** The checks and the insert run in one transaction after `pg_advisory_xact_lock` (one key per provider), so parallel requests cannot all pass the check and overshoot a limit. Invite creation uses the same technique.

**Prices live in `@piston/shared`** (`MODEL_PRICES`, USD per million tokens, cache reads and writes priced separately). A model missing from the table is priced like the most expensive known model: over-estimating is the safe direction for a cap. A Tavily extract really costs 0.2 credit per URL; it is budgeted at 1 credit unless the response reports its own `usage.credits`.

**Ledger rows survive account deletion** (`user_id` is set to null): deleting an account must not erase what it spent from the global limits. A warning is logged once per process and month when 80 % of a monthly budget is reached.

**Invitations are capped at 5 per user per rolling 7 days**, since each new account gets its own per-user quota.

**`GET /api/usage`** returns the user's own 24 h counts and limits and the server's monthly budget as percentages only (no money amounts).

**These are estimates, so provider-side limits remain the real hard stop.** The ledger can drift from the invoice (price changes, fallback models, uncounted retries, a bug). The self-hoster must also set a spend limit in the Anthropic Console and keep Tavily on a plan with a credit cap; see « Limiting costs » in the getting-started guide.

## Frontend

**Password forms are disabled until hydration.** Before Vue takes over the page, pressing Enter in the login form would trigger a native GET submission and put the password in the URL. The submit buttons of the login and sign-up forms stay disabled until the component is mounted (`useHydrated()`).

**Kanban on a phone.** Columns scroll horizontally with snap points below the `xl` breakpoint and form a five-column grid above. Dragging starts after a 150 ms touch delay so a swipe still scrolls the board. Every card also has « déplacer » buttons, so the board works with a keyboard or a screen reader. Failed moves are rolled back with an error toast.

**Score colors.** Match scores are green from 70, orange from 40, red below.

## Testing

**API routes are tested in-process, without a server.** Nitro auto-imports helpers into route files. Under Vitest, `apps/web/test/server/setup.ts` exposes the same names as globals (real h3 functions and server utils, plus test doubles for the session, runtime config, database and Claude), and routes are called through a real h3 app together with the production middleware. This keeps tests fast and lets them exercise the real handlers.

**In-memory PostgreSQL (PGlite) for tests.** Tests run the real migrations against PGlite, so SQL behavior (constraints, JSON columns, the partial unique index) is tested for real, with no Docker needed in CI.

**Tests run under the Bun runtime** (`bun --bun vitest run`). The Nuxt test environment (`@nuxt/test-utils`) gets a longer hook timeout, because booting it can be slow when Turborepo runs every workspace's tests at once.

**CV PDFs are tested by extracting their text.** Every template, layout, style and font pairing is rendered in `packages/cv-render`'s tests and read back with pdf.js (the server tests use pdf-parse on the routes' output): accents and Latin Extended letters, link targets, embedded fonts, reading order and content boxes are checked on the real bytes.

**PDF import is tested with real pdf-parse** on tiny PDFs built by hand in the test, including one without a text layer.

**Password hashing is stubbed in route tests.** scrypt is deliberately slow and is nuxt-auth-utils' responsibility; route tests use a reversible fake to test our logic only.

## CV exports and sharing (v2)

**Share links serve the PDF only, behind an unguessable, revocable token.** The URL carries 32 random bytes (base64url, 256 bits), unique in the database; the token is the only credential, so a link works for whoever holds it (the trade-off of any « anyone with the link » feature). Limits: the owner can revoke at once, links can expire (7 / 30 days or never), the page and the API are `noindex`, responses are `no-store`, the endpoint never returns the JSON document (no structured data to scrape, no way to read other data), and a per-token cap of 20 renders per minute keeps a leaked link from burning CPU. The PDF is rendered on the fly from the current saved document, so the link always shows the latest version; the number of views is counted per PDF render. Deleting the document or the account deletes its links.

**Word export is structure-faithful, not pixel-perfect, and says so.** The `docx` package (pure JS, no native code) builds headings, bullets, palette, fonts by name and, for sidebar layouts only, a two-column table. Header styles, gauges and the photo are not reproduced: promising a copy of the PDF in Word would be false, since Word has no equivalent of the layout engine. The menu entry reads « Word (modifiable) ».

**The matching cover letter reuses the CV engine's header block instead of a second header.** The letter is drawn with `headerBlock` and the same tokens, so any new header style applies to letters for free. The letter text already holds its greeting and signature, so the renderer adds only the date and the recipient.

## Production readiness and security

**Backups are a Compose service, not a host cron.** A `postgres:17-alpine` container (it ships `pg_dump`) runs a plain `sh` loop: sleep until `BACKUP_HOUR`, dump, gzip, verify, rename, rotate by file age. A cron daemon or a scheduler image would add a moving part for one job a day, and the loop is readable in 70 lines (`deploy/backup.sh`). Dumps are plain SQL with `--clean --if-exists`, so restoring is `gunzip | psql` with no matching `pg_restore` version needed. They are written under a temporary name and renamed only once valid.

**Off-site copy uses `aws-cli`, installed on demand.** Considered: `rclone` (a second config format and per-remote env names) and a sidecar image. `aws s3 cp` is configured by four standard environment variables, and `AWS_ENDPOINT_URL` makes it work with every S3-compatible provider. It is installed with `apk` only when `BACKUP_S3_URL` is set, so users who do not want it pay nothing. Remote rotation is left to the bucket's lifecycle rule: deleting remote objects from a script that holds write credentials is a risk (a bug or a compromise could wipe the history).

**Login throttling lives in Postgres, as a sliding window over event rows** (`auth_attempts`: bucket and time). It survives restarts and works with several containers, with no new infrastructure; the cost is one indexed `count` per login, negligible next to scrypt. Failures count per e-mail (10 / 15 min) and per IP (30 / 15 min); the e-mail limit locks even the correct password, which is the point of a limit, and a successful login clears it. The e-mail counter lets an attacker lock a victim out for 15 minutes: accepted, the alternative (no limit) is worse for an invite-only app. Rows are purged opportunistically, no scheduler.

**The client IP is the LAST `X-Forwarded-For` entry, and only with `TRUST_PROXY=true`.** nginx-proxy appends the address it saw to whatever the client sent, so the first entry is attacker-controlled. This assumes one proxy hop; a CDN in front would need a hop count.

**The invitation page is throttled by a middleware too.** It validates its link during server rendering through an internal request that has no client address, so the page request itself is counted; the internal request is skipped.

**Passwords are reset from the server's shell, not over HTTP.** A route protected by a printed one-time token is one more attack surface (and a token in the logs); a Nitro task is not runnable from the built output. Instead `packages/db/src/user-cli.ts` is bundled by `bun build` into one file, `/app/cli/user.js`, in the image: `docker compose exec web bun cli/user.js reset-password <email>`. Shell access to the host already means access to the database, so the CLI adds no new trust boundary. It hashes with the same `@adonisjs/hash` scrypt driver as nuxt-auth-utils (a test checks both ways), prints a random 20-character password once, and bumps the user's session version.

**Sessions carry a per-user version.** `users.session_version` is copied into the cookie at login and compared on every protected API call (one primary-key read) and on `GET /api/_auth/session`. A password change or reset increments it: every older cookie dies, the current device gets a new one. Cookies from before the change have no version and count as 0, so nobody is logged out by the upgrade. The lifetime is `SESSION_MAX_AGE` (30 days, absolute from login: h3 sessions do not slide).

**CSP uses a nonce, not `unsafe-inline`, for scripts.** Nuxt renders inline scripts (payload bootstrap, color mode); a Nitro `render:html` hook adds the request's nonce to each. Styles keep `unsafe-inline` because Vue and Nuxt UI emit style attributes that cannot be nonced. `wasm-unsafe-eval` is for pdf.js, `blob:` for the CV worker and the photo preview. In development the policy is report-only (Vite injects scripts without nonce); in production it is enforced, and `CSP_REPORT_ONLY=true` is the escape hatch. Icons come from the bundled `@iconify-json/lucide` collection and are served by the app itself: without it the browser fetches them from api.iconify.design, which the policy (and privacy) rejects.

**Errors: JSON lines and a request id, no Sentry.** Only 5xx are logged, with a fixed set of fields: nothing from the request body, query string or document can appear, tokens in paths are masked, the user is a keyed hash, and driver errors are cut to their first line (they can embed SQL). A DSN-based reporter would send error data to a third party and needs a real SDK to be useful (stack mapping, breadcrumbs); `docker logs` plus an uptime monitor on `/api/health` is the documented alternative. The health route now also checks the database and the disk.

## End-to-end tests

**Playwright drives the real built app, with fake providers plugged in at the two client factories.** `NUXT_E2E_FAKE_AI=1` makes `useClaude()` return a small fake Anthropic client and `tavilyRequest()` return canned results (`apps/web/server/utils/fake-ai.ts`). Everything else runs for real: validation, the usage ledger (reservations and settlements), storage, SSE streaming, PDF and Word rendering. Mocking HTTP in the browser (`page.route`) was rejected: Claude is called from the server, and it would leave the streaming code untested. The fake picks its canned French answer from the JSON schema the route sends (each structured output has a distinctive top-level key), so adding a feature means adding one answer, not a new switch on prompts.

**The guard cannot be bypassed by configuration.** `isFakeAi()` throws when the flag is set and `NODE_ENV=production`, and a Nitro plugin calls it at startup, so such a server refuses to boot. It reads `process.env` through an alias because the bundler inlines a literal `process.env.NODE_ENV` as `"production"` at build time. The e2e server therefore runs the production build with `NODE_ENV=test` (same code, same CSP). The flag is read from the environment, never from runtime config, so it cannot be set from a request or appear in a client payload.

**The test database can never be the development one.** `packages/db/src/e2e-seed.ts` drops and recreates the schema on every run, so it exits unless the database name ends with `_e2e`. The e2e build writes to `.nuxt-e2e` (`NUXT_E2E_BUILD_DIR`) so it never overwrites the `.nuxt` of a running `bun dev`. Tests run serially on one seeded user and use unique titles; the suite fails on any Content-Security-Policy violation.

## Product consistency

**One letter editor, one history per offer.** The offer page and the application's letter page share `LettersEditor` (template, tone, highlights, generation, paragraph rewrite, corrections, versions, exports). An offer has at most one application, so its letters form a single history listed by `GET /api/offers/:id/letters`, whichever page they were written from; when the offer is tracked, both pages send `applicationId` so Claude reads the notes. « Lettres » groups by offer and links to the application's letter page when there is one. `GET /api/applications/:id/letters` is kept for compatibility.

**Salutation and closing are derived, not stored apart.** Letters stay `{ paragraphs: string[] }`. `app/utils/letters.ts` splits them for display: at most two leading lines that look like a subject or a salutation, at most three trailing lines that look like a one-sentence closing formula or a name. These show as light lines with an inline edit; only the body is numbered, rewritable and counted. Lines glued to a body paragraph by a single line break are split off, and the editor compares letters in that joined form, so opening an old letter is never an unsaved change. When in doubt a line stays in the body. The prompt now asks Claude to put each of these lines in its own paragraph.

**Next steps follow the main flow.** The offer page, the application's letter page and its detail panel show one « Prochaine étape » card: analysis → letter → application → CV tailored to the offer (`cv_documents.offer_id`). « Adapter mon CV à cette offre » copies the latest CV of the offer's profile for the offer and opens the editor with `?adapter=<offerId>`, the editor's own « Dans une copie dédiée » flow. The dashboard picks its next step from the real state: resume, review, first offer, applications « à envoyer », then follow-ups older than ten days.

**Onboarding stays out of the way.** No guided tour with spotlights: it breaks on every layout change and people skip it. Instead, three light pieces. A welcome dialog on the first visit (the three-step flow, one button to the CV page). « Premiers pas · n sur 4 » with four segments in the dashboard's next-step card until the user has a resume, a review, an offer and an application; the card already says what to do next. A one-sentence tip at the top of the CV, Offres and Candidatures pages, closed with « Compris » (`AppPage tip="…"`). What was closed is stored in `users.dismissed_hints` (not `localStorage`), so it stays closed on a phone too, and is loaded during SSR so a closed tip never flashes. « Mon compte › Revoir l'introduction » clears it. The e2e user is seeded with everything closed.

**Shared UI helpers.** Dates go through `app/utils/dates.ts` (one format per kind of date, relative dates for letter versions, rendered after hydration). Error toasts carry `i-lucide-circle-alert`, success toasts `i-lucide-check`; load errors are a subtle `UAlert` with `apiErrorMessage` as description. Every generation shows `StreamingIndicator` with « Arrêter » (`useGeneration().abort()`; an aborted generation is not saved). Dropdown items that open a dialog are deferred until the menu has closed and the menu is non-modal (`utils/menus.ts`), so the menu handing focus back to its trigger cannot dismiss the dialog.

## Mobile and PWA

**A hand-written service worker, not a module.** `public/sw.js` is about 70 lines: static, content-addressed files (`/_nuxt/`, `/_fonts/`, `/cv-fonts/`, icons) are cache-first; navigations always hit the network and fall back to `/offline.html` (« Tu es hors ligne »); `/api/**` and every non-GET request are never touched, and HTML (which holds user data) is never cached. `/_nuxt/builds/` is excluded so deployments are still detected. A module such as `@vite-pwa/nuxt` would add a build step and generated code for what is a short, auditable file, and the registration (`app/plugins/pwa.client.ts`, an external script, production only) needs no inline script, so the nonce-based CSP is untouched. The worker is served `no-cache` so updates arrive on the next visit; bump `VERSION` to drop the caches. Icons are rendered from the brand mark by `scripts/generate-pwa-icons.mjs` (rounded, maskable with a safe zone, apple-touch).

**Install hint lives in the « Plus » menu.** `useInstallPrompt` keeps the browser's `beforeinstallprompt` event; the menu entry calls its native prompt, or opens iOS instructions (Partager → Sur l'écran d'accueil) where there is none. Hidden once installed (standalone) and for 30 days after « Ne plus proposer » or a declined prompt.

**The CV editor is one section per screen below `lg`.** The same cards stay in the DOM and the inactive ones are hidden by CSS (`max-lg:hidden`), so nothing remounts and desktop is untouched; steps are tracked by section ref (`app/utils/cv-steps.ts`), not index. The preview is a full-screen sheet (mounted only on phones, `useIsDesktop`), and a bottom bar (Aperçu, Exporter, IA) replaces the main tab bar on that page. Touch targets are enforced by one CSS block (`[data-cv-editor]`, `[data-touch-targets]`) instead of per-button classes. Drag handles are 44 px, allow vertical panning, and a drag needs a 250 ms long press; every drag has up / down buttons or menu items as fallback.
