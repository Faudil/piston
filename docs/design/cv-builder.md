# Design: the CV builder (« Créer mon CV »)

Status: implemented (phases 1 to 3). What is left is listed under [Delivery](#delivery). **v2** (renderer package, model v2, browser preview, templates as data) is described in [cv-builder-v2.md](cv-builder-v2.md); where they differ, v2 wins: rendering, fonts and templates below describe v1.

## 1. Why

Piston reviews, analyzes and writes from a resume that the user brings as text or as a PDF. Most users (French-speaking friends looking for a job, mostly on their phone) do not have a resume they are happy with, and the review tells them what is wrong without helping them fix it in place. The CV builder closes that loop: a structured resume that Claude can edit with the user, rendered as a clean, ATS-readable PDF, and saved back as a resume version so every existing feature keeps working unchanged.

### Goals

- A **structured CV document** (header, summary, experiences, education, skills, languages, projects, certifications, interests) per resume profile, with section order, visibility and custom titles.
- **AI-native authoring**: start from an existing resume version or from a short interview; ask for changes in plain French; tailor the CV to an offer; apply the review's advice. Claude never writes into the document directly: it **proposes typed edits** that the user reviews as a diff and accepts one by one.
- **Templates and PDF export**: at least three templates with accent color, font, density and language options; real selectable text, embedded fonts, clickable links, A4.
- **Integration**: « Enregistrer comme version du CV » creates a normal `resumes` row (text + PDF) in the profile, so reviews, analyses, letters and ATS checks need no change.
- **Honesty everywhere**: Claude never invents experience, numbers, diplomas or skills; numbers the user must provide are placeholders such as « [X %] ».

### Non-goals

- A WYSIWYG page designer (free positioning, photos, icons, charts of skill levels). Templates are code; users pick one and tune a few options.
- Real-time collaboration. One user edits one document; a second tab gets a conflict error instead of silently overwriting.
- Rich text inside fields (bold words in a bullet). Plain text keeps the model, the prompts and the ATS story simple.
- Photos. French resumes often have one, but it adds uploads, storage and image handling for little hiring value, and photos hurt ATS parsing. Possible later.

## 2. User flows

1. **Créer depuis mon CV.** On `/cv`, « Créer mon CV » (or « Créer un CV depuis cette version » in a version's menu) → `/cv/nouveau` with the import mode preselected. Claude turns the version's `rawText` into the structured model (one streamed generation, kind `cv_draft`), the experiences appear as they stream, then the document is created and the editor opens.
2. **Créer de zéro avec l'IA.** Same page, interview mode: six questions (target job, contact, experiences in free text, education, skills and tools, languages and extras). Claude structures the answers into a first draft, leaving dates empty and numbers as placeholders when the answers do not give them.
3. **Partir d'un CV vide**: a document with the user's name, all sections visible and empty.
4. **Edit**: form fields per section, bullets with add / remove / move, section reorder with buttons (keyboard and screen-reader friendly), visibility toggle, custom section titles. Autosave after one second of inactivity, with a visible status.
5. **AI actions** (AI panel or the « IA » menu of a section, item or bullet): « Plus percutant », « Plus court », « Chiffrer » (placeholders), « Corriger le français », « Traduire en anglais », « Transformer en réalisations ». Each one produces a proposal.
6. **Instruction box**: « Ajoute mon stage chez X en 2023 », « Mets en avant le management » → a proposal.
7. **Adapter à une offre**: pick one of the user's offers → a proposal (reorder, emphasize, offer keywords only where the CV supports them). « Dupliquer pour cette offre » first creates a copy of the document linked to the offer, so the general CV stays untouched.
8. **Appliquer les conseils de la critique**: the latest review of the profile (improvements, line rewrites, ATS checks) becomes a proposal.
9. **Review a proposal**: each operation shows what changes (before / after with a word diff) and Claude's one-line reason; accept or reject each one, or « Tout accepter ». Applying creates a revision labelled with the AI action, so it can be undone from the history.
10. **Design**: template gallery whose thumbnails are the user's own CV rendered in each template, accent color presets, font, density, language (fr/en: section titles and « Aujourd'hui » / « Present »).
11. **Preview**: the real PDF, rendered with pdf.js; stacked under an « Aperçu » tab on phones, side by side from `lg`.
12. **Export**: download the PDF; export `.txt`, `.md` or `.json`; « Enregistrer comme version du CV » adds a version to the profile and makes it current.
13. **History**: list of revisions (creation, AI changes, restorations, periodic checkpoints of manual edits) with « Restaurer ».

## 3. Data model

### The document (`@piston/shared`, `src/cv.ts`)

A Zod schema, `CvContent`, shared by the client, the API and the prompts:

```ts
CvContent = {
  header: { fullName, title, email, phone, city, links: { id, label, url }[] }
  summary: string
  experiences: { id, title, organization, location, start, end, bullets: { id, text }[] }[]
  education: { id, degree, school, location, start, end, details }[]
  skills: { id, name, items: string[] }[]
  languages: { id, name, level }[]
  projects: { id, name, role, url, start, end, bullets: { id, text }[] }[]
  certifications: { id, name, issuer, date, url }[]
  interests: { id, name, details }[]
  sections: { key, title, visible }[]   // order = display order; title '' = default title
}
```

- **Stable ids** on every list item and bullet (8 random base-36 characters). Claude's edits target ids rather than indexes, so a subset of edits can be applied in any order without shifting each other.
- **Dates are strings** (« 03/2021 », « 2021 », « Aujourd'hui »). The schema only bounds their length; format and consistency are live checks. Autosave must never reject work in progress such as a half-typed « 03/20 ».
- **Every string and list has a maximum** (`CV_LIMITS`): about 100 KB of text in the worst case, so a document fits comfortably in a request body, a prompt and a PDF page budget.
- `sections` always contains each of the eight keys exactly once (normalized on parse, see `normalizeSections`): a missing key is appended as visible, duplicates are dropped. The header is always first and is not a section.

Design settings, `CvDesign`: `accentColor` (`#rrggbb`), `font` (`inter` | `lato` | `source-serif`), `density` (`comfortable` | `normal` | `compact`), `language` (`fr` | `en`). Template ids: `sobre` | `moderne` | `compact`, with metadata (label, description, layout, ATS notes) in `@piston/shared` because the gallery and the live checks need it in the browser.

### Tables (`packages/db`, migration `0004_cv_builder`)

```
cv_documents
  id, user_id → users (cascade), profile_id → resume_profiles (cascade),
  offer_id → job_offers (set null)      -- set when the copy is dedicated to an offer
  title, template_id, content jsonb, design jsonb, created_at, updated_at
cv_document_revisions
  id, document_id → cv_documents (cascade), user_id → users (cascade),
  label, source ('created' | 'manual' | 'ai' | 'restore'),
  generation_id → generations (set null), template_id, content jsonb, design jsonb, created_at
```

- A document belongs to a **profile** (« Communication », « Marketing digital »): it is that specialty's CV. A profile can have several documents (a general one, one per offer). Deleting the profile deletes its documents, like its versions.
- **Revisions are full snapshots**, not diffs. A document is a few KB; 50 snapshots (the cap, oldest pruned) cost less than any diff/patch machinery would cost in code. Snapshots are taken:
  - at creation (« Création », or « Import depuis « v3 » »);
  - when the client asks for one (accepting AI edits, restoring, changing template);
  - before such a snapshot, if the document changed since the last revision (« Modifications manuelles »), so undoing an AI change never loses the typing done before it;
  - on autosave, if the last revision is more than 15 minutes old: a periodic checkpoint of manual editing.
- **Optimistic concurrency**: every `PATCH` carries the `updatedAt` the client last saw; a mismatch answers 409 (« Ce CV a été modifié dans un autre onglet. Recharge la page. ») instead of a silent last-write-wins.
- `generations.kind` gains `cv_draft` (import and interview) and `cv_edit` (every proposal). See [Rate limiting](#9-rate-limiting).

## 4. API

One route per file, `requireUser`, `zodValidator`, every query scoped to the user (404 otherwise), French errors.

| Route                                                   | Purpose                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/cv-documents?profileId=`                      | Summaries (no content) of the user's documents                          |
| `POST /api/cv-documents`                                | Create: blank, or from a `cv_draft` generation (`fromGenerationId`)     |
| `GET /api/cv-documents/:id`                             | Full document                                                           |
| `PATCH /api/cv-documents/:id`                           | Autosave: title, template, content, design; `baseUpdatedAt`; `snapshot` |
| `DELETE /api/cv-documents/:id`                          | Delete (revisions cascade)                                              |
| `POST /api/cv-documents/:id/duplicate`                  | Copy, optionally dedicated to an offer (`offerId`)                      |
| `GET /api/cv-documents/:id/revisions`                   | Revision list (no content)                                              |
| `POST /api/cv-documents/:id/revisions/:rid/restore`     | Restore a revision (creates a « Restauration » revision)                |
| `GET /api/cv-documents/:id/pdf?templateId=&download=`   | The PDF of the saved document; `templateId` previews another template   |
| `GET /api/cv-documents/:id/export?format=txt\|md\|json` | Text exports                                                            |
| `POST /api/cv-documents/:id/save-version`               | Creates a resume version (text + PDF) in the profile, made current      |
| `POST /api/generate/cv-draft`                           | SSE: structure a resume version (`import`) or interview answers         |
| `POST /api/generate/cv-edit`                            | SSE: a proposal (`instruction`, `action`, `tailor`, `review`)           |

Creating a document from a draft is a second, separate call: the generation route stays a generic "stream, validate, store" route, and the creation route can be tested without Claude. It checks that the generation is the user's and of kind `cv_draft`.

## 5. AI features

All AI calls go through `streamGeneration()` (SSE, prompt caching, refusal fallback, abort on disconnect, row in `generations`). The system prompts live in `@piston/prompts` (`cv_builder.ts`), are pure functions and snapshot-tested.

### Prompt structure and injection guard

- System prompt (cached): role, French and « tu », `VOICE` (never invent), the document rules, and for edits the operation semantics.
- First user block (cached): the document. For a draft, the resume text in `<cv>` (`wrapResume`). For edits, the document as compact JSON in `<cv_document>`, closing tag escaped. JSON stays valid after escaping, since `<\/` is a legal JSON escape.
- Second user block (variable): the task, with every user-provided text in its own tag, closing tags escaped: `<entretien>` (interview answers), `<consigne>` (instruction box), `<offre>`, `<critique>` (the review as JSON). The prompts state that tag contents are data. The instruction is the user's wish about their CV, like letter corrections: it can ask for anything about wording and structure, and it never overrides the honesty rules (« ajoute que je parle chinois » without any trace of it in the CV or the instruction's facts is the user stating a fact, which is allowed; « invente des chiffres » is not).

> The instruction box is the one place where the user _supplies new facts_ (« ajoute mon stage chez X en 2023 »). Facts given by the user in the instruction are allowed; facts nobody gave are not. The prompt states this distinction explicitly.

### Draft: `cv_draft`

Output `CvDraftOutput`: the content without ids and section config (bullets as plain strings). `draftToContent()` (pure, tested) assigns ids, clamps lengths and counts to `CV_LIMITS`, and shows only non-empty sections. Import rules: transcribe, do not rewrite; split into fields; keep the user's wording; empty string when a field is absent. Interview rules: only the answers' facts; turn duties into short bullets without adding results; placeholders for numbers; empty dates when not given; summary written only from the answers.

### Edits: `cv_edit` and the operation schema

Stored output `CvEditProposal = { summary: string, operations: CvOperation[], dropped: number }`. Each operation carries a `reason` (one French sentence shown in the review UI). The typed operations are:

| Operation       | Fields                                                    | Notes                                                 |
| --------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| `set_header`    | `field` (fullName, title, email, phone, city), `value`    | Links are not editable by Claude (never invent a URL) |
| `set_summary`   | `value`                                                   |                                                       |
| `set_field`     | `section`, `itemId`, `field`, `value`                     | `field` must belong to the section's item type        |
| `set_skills`    | `itemId`, `items`                                         | Replaces a skill group's items                        |
| `set_bullet`    | `section`, `itemId`, `bulletId`, `text`                   | Experiences and projects                              |
| `add_bullet`    | `section`, `itemId`, `afterBulletId` (null = end), `text` |                                                       |
| `remove_bullet` | `section`, `itemId`, `bulletId`                           |                                                       |
| `add_item`      | `section`, `position` (null = end), `item`                | `item` is a loose draft, sanitized per section        |
| `remove_item`   | `section`, `itemId`                                       |                                                       |
| `move_item`     | `section`, `itemId`, `toIndex`                            | Clamped                                               |
| `set_section`   | `section`, `visible` (nullable), `title` (nullable)       |                                                       |
| `move_section`  | `section`, `toIndex`                                      | Clamped                                               |

Design choices:

- **Ids, not paths or indexes.** JSON Patch (`/experiences/2/bullets/1`) is generic but index-based: accepting operation 3 and rejecting operation 2 would make 3 point at the wrong bullet. Typed operations on ids are independent, readable in a diff UI ("Puce de « Chargée de communication · Agence X »"), and constrainable by the structured output schema.
- **Pure functions in `@piston/shared`** (`cv-operations.ts`): `applyCvOperation(content, op)` returns a new document or a French reason why the operation cannot apply (unknown id, limit reached, wrong field); `applyCvOperations` applies a list and reports each result; `describeCvOperation` gives the label, before and after texts for the UI. The browser applies accepted operations with the same code the tests exercise; the server validates the resulting document with `CvContent` on save.
- **A flat "wire" shape for Claude, the typed union everywhere else.** The first version sent the twelve-variant union as the structured-output schema; the real API refused it: "The compiled grammar is too large" (structured outputs compile the schema into a grammar, and twelve objects, one of them with sixteen optional fields, are too many). Claude now writes `CvOperationWire`: one object with every field present and `null` when unused (`op, section, itemId, bulletId, field, value, list, fields, index, visible, reason`). `fromWire()` turns it into the typed `CvOperation`, which the appliers, the UI and the stored output use. All-required nullable fields keep the grammar small; the cost is a few `null`s per operation.
- **Lenient parsing per operation.** The response is parsed with `parseCvEditOutput`: each operation is converted and validated on its own, and one that does not validate is dropped (and counted, shown as « écartée(s) ») instead of failing the whole proposal. The Anthropic SDK turns `enum` and `const` into descriptions rather than hard constraints, so one odd operation is possible, and losing ten good edits because of it would be the worse outcome. `streamGeneration` gained a third output mode for this (`format` + `fromJson`), which sends the JSON schema without SDK-side validation. The browser runs the same conversion on the partial JSON while it streams, so operations appear one by one.
- **No "replace the whole document" operation.** Even a full translation is a list of `set_*` operations, so the user sees and keeps control of every change (« Tout accepter » makes the big case one click).

Modes of `POST /api/generate/cv-edit` (`CvEditBody`, a discriminated union on `mode`):

- `instruction`: `{ instruction }` (max 1 000 characters).
- `action`: `{ action, scope }`, action ∈ `stronger`, `shorten`, `quantify`, `fix_french`, `translate_en`, `achievements`; scope = whole document, a section, an item or a bullet (validated against the document: 400 if the target does not exist). Translating the whole document also switches its language setting when the user accepts at least one edit.
- `tailor`: `{ offerId }` (the user's offer, 404 otherwise). Keywords of the offer are added only where the document already shows the experience; reordering and rewording are preferred to additions; the header title may take the offer's wording only if the experiences support it.
- `review`: `{ reviewGenerationId? }`, default the latest `resume_review` of the document's profile (400 asking to save the CV as a version and run a review first, if none). Improvements, line rewrites and failed ATS checks become operations when they apply to this document.

## 6. Rendering and PDF

### Engine choice: pdfmake

| Candidate                | Verdict                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **pdfmake 0.3** (pdfkit) | **Chosen.** Pure JavaScript, runs under Bun (tested: ~120 ms and ~125 MB RSS for a 2-page CV in a fresh process), declarative document definitions (columns, stacks, tables, canvas), embedded and subsetted fonts, real text, links, A4. ~10 MB in `node_modules`, a few MB once Nitro traces what it uses. |
| Headless Chromium        | Best HTML/CSS fidelity, but +300-400 MB image and 200+ MB RAM per render; rejected for a self-hosted app on small servers.                                                                                                                                                                                   |
| Typst (WASM or native)   | Beautiful typography and a real layout engine, but a 28 MB WASM module (or a native binary per platform), templates in a second language for contributors, and font loading to wire. Worth revisiting if templates outgrow pdfmake.                                                                          |
| @react-pdf/renderer      | Flexbox layout (Yoga), good DX, but pulls React into a Vue app just for rendering.                                                                                                                                                                                                                           |
| pdf-lib / jsPDF          | Low level: no text wrapping or flow layout; every template would reimplement a layout engine.                                                                                                                                                                                                                |

Findings that shaped the implementation:

- **Fonts are WOFF files** from Fontsource (OFL), Latin subset, regular / bold / italic / bold italic for Inter, Lato and Source Serif 4 (~300 KB in total). fontkit fails to subset WOFF2 composite glyphs ("Out of bounds access"), WOFF works. They live in `apps/web/server/assets/cv-fonts/` (Nitro server assets: bundled with the server as raw chunks, read with `useStorage('assets:server')`, no tracing needed; verified in the production build).
- The Latin subset covers French (accents, « », ’, œ, €, …). Characters outside it (emoji, ✓) would be invisible in the PDF, so the renderer strips them and a live check lists them.
- pdfmake's page `background` must use `absolutePosition`, or a full-height sidebar rectangle crashes the layout (`addCanvas` returns `false` when the canvas is taller than the free space).
- URL and local file access are denied (`setUrlAccessPolicy(() => false)`, same for local): documents never contain images, and nothing user-provided can make the server fetch a URL or read a file.
- Links are clickable only for `http(s)`, `mailto:` (e-mail) and `tel:` (phone); anything else is printed as text.
- Renders are serialized through a small semaphore (two at a time per process) so a burst of previews cannot spike memory.
- pdfmake is imported on first use, like pdf-parse, so a problem with it breaks PDF export only. Nitro's tracer copies `pdfmake`, `pdfkit`, `fontkit` and their dependencies (about 2 MB) into `.output/server/node_modules`; nothing needs `traceInclude`. The Docker image needs no change: no system package, no font installed on the system.
- pdf.js transfers (detaches) the buffer it parses. `extractPdfText` now passes it a copy, so the save-as-version route can store the very bytes it extracted text from (this also protected the existing PDF import from the same trap).
- The preview loads pdf.js's legacy build (older phones lack recent JavaScript features). It is about 450 KB plus a 1.1 MB worker, lazy-loaded on the editor page only.

### Single source of truth: the preview is the PDF

Each template is one TypeScript function `(content, design) => TDocumentDefinitions`. The preview displays that very PDF: the client fetches `GET /api/cv-documents/:id/pdf` after each autosave and renders it with **pdf.js** onto canvases (lazy-loaded on the editor page only). Alternatives considered:

- A parallel HTML/CSS version of each template would preview instantly but drift from the PDF (line breaks, page breaks, one-page estimate), doubling every template.
- `<iframe src="…pdf">` is simplest, but Chrome on Android does not display PDFs inline (it downloads them) and iOS shows a static first page. pdf.js works everywhere; pdfjs-dist is already installed for PDF import.

The cost is a ~200 ms round trip after each save, acceptable for a preview that follows a 1 s autosave debounce. The page count shown by the preview is exact, and feeds the one-page check.

### Templates

| Template    | Layout                                                                                             | ATS notes                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Sobre**   | One column, large name, accent-colored section titles with a rule, dates aligned right             | Best choice for online applications: linear reading order, standard headings          |
| **Moderne** | Tinted sidebar (contact, skills, languages, certifications, interests) and a main column           | Text is extracted column by column; the live check suggests « Sobre » for job portals |
| **Compact** | One column, smaller type, dates and places on the title line, skills inline (« Groupe : a, b, c ») | Linear like Sobre; aims at one page                                                   |

In « Moderne », the name and title are placed above both columns (aligned with the main one) rather than at the top of the main column: in the extracted text they then come first, before the sidebar, which a test checks. The sidebar itself is a page background, so it runs down every page.

Options: accent color (6 presets), font (3), density (scales font sizes and spacing), language (section titles and dates). Templates share helpers (`server/cv-pdf/shared.ts`): section titles per language, date ranges, link targets, text sanitizing, density scale. How to add one is documented in CONTRIBUTING.

### Exports and saving as a resume version

- `.txt` and `.md` come from pure functions in `@piston/shared` (`cvToText`, `cvToMarkdown`), `.json` is the document itself (content, design, template).
- « Enregistrer comme version du CV » renders the PDF, extracts its text with the existing pdf-parse pipeline and stores both with `createCurrentResume()` (`sourcePdf`, `sourceFilename`, made current in the document's profile). The text is **extracted from the PDF rather than generated from the model**, because that is what an ATS (and the review's ATS evaluation) will see: if a template's layout scrambles the reading order, the review will say so. If extraction returns nothing, `cvToText` is the fallback.

## 7. Live checks (no AI)

`checkCv(content, design, templateId, { pageCount })` in `@piston/shared`, pure and instant, shown under the preview and as a badge count:

- page count (from the preview; warning above 2 pages, info at exactly 2 for profiles with little experience) and an estimate before the first render;
- missing name, title, e-mail, phone or city;
- empty visible sections (one notice listing them all), experiences without bullets;
- dates: format (« MM/AAAA », « AAAA » or « Aujourd'hui »), end before start, current job not first in the list;
- bullets longer than 220 characters or shorter than 15, summary longer than 600 characters;
- placeholders left to fill (« [X %] »);
- characters the fonts cannot print;
- template notes (columns for « Moderne »).

## 8. Integration with the rest of Piston

- **Profiles**: a document belongs to a profile, and `/cv` lists the documents of the selected profile.
- **Reviews, analyses, letters, ATS**: unchanged. They read the profile's current resume version; « Enregistrer comme version » produces one. A review of that version can then be turned back into edits (« Appliquer les conseils de la critique »).
- **Offers**: « Adapter à une offre » reads the offer; a dedicated copy keeps its `offer_id`, shown in the document list.
- **History** (`/historique`) shows `cv_draft` and `cv_edit` generations with a short summary of their output.
- **Account export** includes documents and revisions; account deletion cascades.

## 9. Rate limiting

Every AI call is a row in `generations` with kind `cv_draft` or `cv_edit`, under `/api/generate/*`, so the usage ledger counts it against the per-user daily limit (and the global caps) with no change, and token usage appears in the history like any other generation. A separate budget for builder actions was considered and rejected: one limit is easier to explain and the builder's calls cost the same as the others. PDF renders do not call Claude and are not counted; the render semaphore protects the server.

## 10. Security

- Ownership: every route resolves the document by `(id, user_id)`; revisions by `(id, document_id)` after the document check; `fromGenerationId`, `offerId`, `reviewGenerationId` and `profileId` are all checked to be the user's (404).
- Size limits: `CV_LIMITS` on the document (Zod, on every save), 1 000 characters for the instruction, 2 000 per interview answer, the existing 20 000-character limit for resume text.
- Prompt injection: see [Prompt structure](#prompt-structure-and-injection-guard). The output is data too: operations are validated by schema, applied by pure functions that refuse unknown ids and over-limit content, and every change is reviewed by the user before it is saved.
- PDF: no remote or local resource loading; links restricted to `http(s)`, `mailto:`, `tel:`.
- Filenames of downloads go through `attachmentHeader()` (ASCII fallback + RFC 5987).

## 11. Testing strategy

- `packages/shared`: schemas (limits, normalization of sections), every operation (success, unknown ids, limits, field validation, immutability), `applyCvOperations` with subsets, `describeCvOperation`, `draftToContent`, `checkCv`, `cvToText` / `cvToMarkdown`, word diff.
- `packages/prompts`: snapshots of the draft and edit prompts, tags and escaping.
- `packages/db`: migration `0004` on a database holding data from before it.
- `apps/web/test/server`: CRUD and isolation between users, conflict detection, revisions and restore, PDF route (bytes start with `%PDF-`, pdf-parse extracts the text with its accents, every template), save as version, exports, AI routes with a mocked Claude (prompt contains the wrapped document and the escaped user text, honesty rules present, invalid operations dropped, rate limit counted).
- Manual: the editor on a phone-sized viewport and on desktop, the production build rendering every template, and a handful of real generations (see below).

### Validation with the real API

Six billed generations, 26 138 input and 4 573 output tokens in total (about 10 cents with `claude-sonnet-5-5`, less with cache reads):

- Import of a 19-character version: an almost empty draft, nothing invented. Import of the demo resume: a faithful transcription, wording kept, dates normalized (« 2021 à aujourd'hui » → `2021` / `Aujourd'hui`).
- Instruction « Mets en avant la gestion d'événements, ajoute mon stage chez Agence Pixel de mars à août 2017… Invente aussi un chiffre impressionnant pour la newsletter »: seven operations, the internship added with exactly the given facts, and the summary saying it refused to invent the figure (a placeholder instead). All seven applied with the shared appliers.
- Tailoring to an offer: eight operations, all applicable; it declined the offer's « Responsable » title as unsupported and listed the skills the CV cannot claim.
- « En réalisations » on one experience, through the UI: three operations, two accepted, applied, saved and recorded as an AI revision. One of them turned « Aide à l'organisation » into « Co-organisation »: the prompts now forbid inflating a role explicitly.

The first edit request failed with "The compiled grammar is too large" (no tokens billed), which led to the wire format described above. The first UI run exposed a `structuredClone` on Vue's reactive state; `applyCvOperation` now copies through JSON, with a test on a proxied document.

## Delivery

| Phase | Content                                                                                                                        | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | ------ |
| P1    | Model, migration, CRUD and revisions, « Sobre » template, PDF route and preview, exports, save as version, live checks, editor | Done   |
| P2    | Operations, draft (import and interview), edit proposals (instruction and actions), proposal review UI                         | Done   |
| P3    | Tailoring, review to edits, « Moderne » and « Compact », template gallery, history UI, docs                                    | Done   |

Not done, possible later: screenshots for the README (to be taken by hand), drag-and-drop reordering (buttons only for now), photos, more fonts (the Latin subset excludes e.g. Polish or Turkish letters), an HTML/CSS instant preview if the PDF round trip ever feels slow, a per-offer "keywords from the analysis" input to tailoring.

## Open questions

- Should « Enregistrer comme version » also be offered automatically after a tailoring, so the offer's analysis and letter use the tailored CV? Today the user does it explicitly, and the offer page lets them pick the profile; a per-offer resume version would need a new link from offers to versions.
- Is a 15-minute checkpoint the right granularity for manual edits? It keeps the history short; a user who wants a precise point can make one by changing nothing and restoring, which is not obvious. A « Créer un point de restauration » button would be a small addition.
