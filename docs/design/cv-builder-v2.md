# Design: CV builder v2 — a real alternative to Canva and CVDesignr

Status: in progress — WP0 (foundation) done, see [§5](#5-wp0-delivered-contracts-for-the-next-work-packages). Builds on [cv-builder.md](cv-builder.md) (v1: structured model, reviewable AI edits, three pdfmake templates, revisions). This document is the plan for the v2 work packages; each package updates it when it lands.

## 1. Why

v1 is solid where it matters for job seekers (structured content, honest AI edits reviewed as a diff, ATS-readable PDFs). It loses to design-first tools on everything visible:

| Area            | v1                                    | Canva / CVDesignr / Enhancv-style tools                                   |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| Templates       | 3, three fonts, six colors            | Dozens, each with color and font variants, filterable                     |
| Preview         | Server PDF after each autosave (~1 s) | Instant, click on the document to edit                                    |
| Editing         | Up/down buttons, fixed sections       | Drag and drop, custom sections, photo, skill levels, undo/redo            |
| Design controls | Color, font, density                  | Palettes, font pairings, spacing, header and section styles, icons, photo |
| Extras          | PDF, txt, md, json                    | Matching cover letter, Word export, share link                            |
| AI              | Edits as reviewed operations (ahead)  | Mostly "generate text"; few let you review                                |

v2 keeps v1's principles — a structured document, one source of truth per template, real text in the PDF, AI proposals the user reviews, never inventing — and closes the visible gaps.

### Non-goals

- Free-form canvas editing (drag any box anywhere, Canva-style). It produces CVs that ATS software cannot read and that break on content changes. v2 offers _layout choices_ within templates instead.
- A template marketplace or user-authored templates in the UI (templates stay code, documented in CONTRIBUTING).
- Collaboration in real time.

## 2. Architecture changes

### 2.1 One renderer, two places: `packages/cv-render`

The pdfmake templates move from `apps/web/server/cv-pdf` to a new isomorphic package, `@piston/cv-render`:

```
render(document: CvRenderInput, assets: CvAssets) => TDocumentDefinitions   // pure
renderPdf(document, assets, pdfmake) => Promise<Uint8Array>                  // thin wrapper
```

- **Browser**: a Web Worker (`app/workers/cv-render.worker.ts`) holds pdfmake and the fonts, renders on every change (debounced ~150 ms) and posts the bytes back; pdf.js draws them. No network round trip, no dependency on autosave.
- **Server**: export, « Enregistrer comme version », thumbnails for the gallery's server fallback, and tests use the same `render()`.
- **Fonts** are WOFF files (OFL), Latin + Latin Extended (fixes Polish, Czech, Turkish…), in `packages/cv-render/fonts/`, served to the browser at `/cv-fonts/` (Nitro public assets, 30-day cache) and read on the server from the same directory (Nitro server assets `assets:cv-fonts`). Loaded lazily per font pairing.
- **Images** (photo, icons): photos are data URLs passed in `assets`; icons are inline SVG paths rendered with pdfmake's `svg` node. URL and file access stay denied.

### 2.2 Template engine: layouts × styles

Instead of three hand-written templates, templates are compositions of reusable blocks, so adding one is ~40 lines:

- **Layouts**: `single` (one column), `sidebar-left`, `sidebar-right`, `split` (two equal columns below a header), `banner` (full-width colored header band, then one column).
- **Header styles**: name left / centered / in band; contact as line, as column, with icons; optional photo (round, rounded, square) left/right/centered.
- **Section title styles**: underline, rule full width, block (filled background), left bar, small caps, icon + title.
- **Item styles**: dates right, dates left column (timeline), dates under title; bullets dot / dash / none.
- **Skill and language renderers**: text list, tags (pills), bars, dots (1–5), CECRL label for languages.
- **Tokens**: palette (primary, secondary, text, muted, background of sidebar/band), font pairing (heading/body), base size, line height, spacing scale, margins.

A template = `{ id, label, category, layout, header, sectionTitle, item, skills, languages, defaults: tokens, atsLevel }`. Target: **12 templates** at launch across categories « Sobre / ATS », « Moderne », « Créatif », « Une page », plus palettes and pairings that multiply the visible variety.

### 2.3 Document model v2 (`@piston/shared`, `cv.ts`)

Backward compatible: every v1 document parses into v2 with defaults (`upgradeCvDocument()` on read, schema `version: 2`).

- **Photo**: `header.photo: { assetId, shape, size, position, visible } | null`, bytes stored in a new table `cv_document_assets` (bytea, ≤ 2 MB after client-side crop/resize to ≤ 800 px, PNG/JPEG/WebP, sniffed by magic bytes).
- **Skill levels**: `skills[].items` become `{ id, name, level: 0–5 (0 = no level) }`. Languages get `cefr: A1–C2 | natif | null` besides the free-text level.
- **New section types**: `volunteering` (like experiences), `awards`, `publications`, `references` (« Disponibles sur demande » toggle), `extras` (« Permis B », « Mobilité », free lines). **Custom sections**: `custom: { id, title, items: { id, title, subtitle, date, text }[] }[]`, any number.
- `sections[]` becomes `{ key | customId, title, visible, column: 'main' | 'side' | 'auto' }` so sidebar layouts let the user move a section between columns.
- **Design v2** (`CvDesign`): `templateId`, `palette { primary, secondary, sidebarBg, text }`, `fontPairing`, `fontSize` (step −2..+2), `lineHeight`, `spacing`, `margins`, `headerStyle`, `sectionTitleStyle`, `skillStyle`, `languageStyle`, `showIcons`, `photo` overrides, `pageFormat` (`A4` | `Letter`), `language` (fr | en). Templates provide defaults; the document stores only overrides, so switching template keeps the user's deliberate choices and resets the rest.

### 2.4 Click-to-edit and live fit

- The worker returns, with the PDF, a **map from content ids to text runs** (the renderer tags nodes with ids; after layout, pdfmake's positioned nodes give page + rectangle). Clicking the preview focuses the matching field in the editor; hovering a field highlights its box on the preview.
- **« Tenir sur une page »**: an auto-fit that re-renders with smaller spacing / size steps (bounded) until the page count is 1, then tells the user what it changed.
- Exact page count and overflow indicator on every render.

## 3. Feature list by work package

Each package lists the files it owns. Packages run in parallel only when they own disjoint files; shared files are edited surgically after re-reading. Every package ends with targeted tests green, typecheck clean, and a short report.

### WP0 — Foundation (sequential, first)

- Model v2 in `packages/shared/src/cv.ts` (+ `upgradeCvDocument`, tests), `CvDesign` v2, template metadata types, operation schema extended for the new fields (`cv-operations.ts`).
- `packages/cv-render` with the block engine, the three v1 templates ported onto it, fonts pipeline (Latin Extended), `render()` + `renderPdf()`, server export switched to it, tests (text extraction, accents, reading order).
- Web Worker preview + pdf.js display (replaces the server round trip), page count, overflow.
- Migration: `cv_document_assets` table; content/design stored as before (jsonb), upgraded on read and rewritten on next save.

### WP1 — Templates and design studio (after WP0)

- 12 templates on the engine, categories, ATS level badge.
- Gallery with real thumbnails: first page rendered by the worker from a sample CV (and from the user's own content on hover), cached.
- Design panel: curated palettes + custom color, 10 font pairings, size/line-height/spacing/margin steps, header / section-title / skill / language styles, icons toggle, photo options, page format, language. « Réinitialiser au modèle ».

### WP2 — Editor UX (after WP0, parallel to WP1)

- Drag and drop (vue-draggable-plus, already a dependency) for sections, items and bullets, keeping the keyboard buttons.
- Editors for the new sections and custom sections; skill level and CECRL inputs; section column choice in sidebar layouts.
- Photo upload with client-side crop (square, preview of the chosen shape), resize, upload to `cv_document_assets`.
- Undo/redo stack (Ctrl+Z / Ctrl+Shift+Z) on top of autosave; revisions stay the long-term history.
- Click-to-edit wiring with the worker's map; mobile editor polish.

### WP3 — AI v2 (after WP0, parallel to WP1/WP2)

- **Design operations** in the proposal system (`set_design`, `set_template`): « Rends-le plus sobre », « Adapte le style au secteur bancaire » → a proposal the user reviews like content edits.
- **Coach panel** in the editor: live checks + the latest review/ATS results for this document, each with a one-click « Proposer une correction » that opens an edit proposal.
- **Writing help per section**: generate the « accroche » from the content, suggest bullets for an experience from the user's own notes (shown as suggestions to confirm, with placeholders, never auto-applied), « Compléter cette section » prompts that ask the user questions instead of inventing.
- **« Traduire en anglais »** into a new document (copy), and « Version courte » (one page) as a proposal.
- Prompt snapshot tests; honesty rules unchanged.

### WP4 — Exports and extras (after WP0)

- **Lettre assortie**: cover letters exported as PDF with the CV's template header, palette and fonts (from `/lettres` and the letter pages).
- **Word export** (`.docx`, with the `docx` package, pure JS): structure and styles, not pixel-perfect, documented as such.
- **Share link**: read-only, unguessable token, revocable, optional expiry, `noindex`; shows the PDF in the browser viewer.

### WP5 — Integration and QA (last, coordinator)

Docker image check (fonts, worker bundle), real-Claude validation of the new AI flows (a handful of calls), screenshots, docs (this file, DECISIONS, README, CONTRIBUTING « Adding a template »).

## 4. Constraints

- 32 GB development machine: at most three agents in parallel, Vitest with `--maxWorkers=2`, one dev server, no parallel builds.
- Bundle: pdfmake + fonts in the worker only, lazy-loaded on the editor page; the gallery thumbnails render in the same worker.
- Accessibility: every drag-and-drop action has a keyboard equivalent; design controls are labelled; the preview has a text alternative (page count, "click a zone to edit it" is an enhancement, never the only way).
- Privacy: photos are personal data; stored in Postgres with the document (backups cover them), deleted with it, never sent to Claude (Claude gets the text only).

## 5. WP0 delivered: contracts for the next work packages

WP0 is done: model v2, design v2 and template metadata, operations v2, the `@piston/cv-render` package (block engine, the three v1 templates ported, fonts, content boxes), the server switched to it, the `cv_document_assets` table, and the Web Worker preview. Later packages build on the contracts below; change them only with the coordinator.

### 5.1 Document model v2 (`packages/shared/src/cv.ts`)

- `CvContent` (Zod) = `z.preprocess(upgradeCvContent, …)`: **every parse upgrades a v1 document**. `content.version === 2`.
- New: `header.photo: CvPhoto | null` (`{ assetId: uuid, shape: 'round'|'rounded'|'square', size: 's'|'m'|'l', position: 'left'|'right'|'center', visible }`); `skills[].items: CvSkill[]` (`{ id, name, level: 0–5 }`, `CV_SKILL_MAX_LEVEL`); `languages[].cefr: CvCefr | null` (`'A1'…'C2' | 'natif'`, labels `cvCefrLabels`, gauge ratio `cvCefrRatio`); sections `volunteering` (experience shape, has bullets), `awards` (name, issuer, date, details), `publications` (title, publisher, date, url), `references` (name, role, organization, contact) + `referencesAvailableOnRequest: boolean` (prints « Références disponibles sur demande » _instead of_ the list), `extras` (`{ id, text }` lines); `custom: CvCustomSection[]` (`{ id, title, items: { id, title, subtitle, date, text }[] }`, at most 6 × 15 items).
- `sections[]` is `CvSectionConfig = CvBuiltinSectionConfig | CvCustomSectionConfig`, discriminated by `key`: `{ key: CvSectionKey, title, visible, column }` or `{ key: 'custom', customId, title: '', visible, column }`. **Deviation from the plan** (`{ customId }` without a key): `key: 'custom'` keeps `section.key` valid everywhere and narrows the type. A custom section's title lives in `custom[].title`; its entry's `title` is always `''`. `column: 'auto' | 'main' | 'side'` (`auto` = the template's `sideSections`).
- `normalizeSections(sections, customIds)`: each built-in key once, missing keys appended (**the eight v1 sections visible, the five new ones hidden**, `cvDefaultVisibleSections`), one entry per custom section. `cvSectionRef(section)` gives a stable string (`'skills'`, `'custom:<id>'`) for DOM ids, Vue keys and content ids. `cvSectionTitle(section, language, content.custom)`.
- Helpers: `createCvItem(section, values)` (all 12 list sections), `createCvCustomSection(title, items)`, `createCvCustomItem(values)`, `cvCustomItemFields`, `cvCustomFieldMaxLength`, `CV_LIMITS` (bounds for every new list and string), `inferCefr`.
- `upgradeCvContent(raw)` (pure, idempotent, deterministic): v1 skills strings get the id `upgradedSkillId(groupId, index)` so two reads of the same v1 document agree; CEFR inferred from the free level text. `upgradeCvDocument({ content, design })` (`cv-upgrade.ts`) parses both. Tested on v1 fixtures (`packages/shared/test/v1-fixtures.ts`).
- Stored documents stay as they are in the database: the server reads every row through `readCvRow` (`server/utils/cv-documents.ts`) and writes v2 on the next save. Revisions too (a v1 revision equal to the upgraded document counts as the same state).

### 5.2 Design v2 and templates (`cv-design.ts`, `cv-templates.ts`)

- `CvDesign` (stored, `z.preprocess(upgradeCvDesign, …)`): `{ version: 2, language, pageFormat: 'A4'|'Letter', palette: { primary?, secondary?, text?, sidebarBg? }, layout?, fontPairing?, fontSize? (−2..2), lineHeight?, spacing?, margins?, headerStyle?, sectionTitleStyle?, itemStyle?, bulletStyle?, skillStyle?, languageStyle?, showIcons? }`. **Absent = the template's value**; `null` is accepted and dropped (a cleared control). `resetCvDesign(design)` = « Réinitialiser au modèle ». `cvDesignOverrideKeys` lists the override fields.
- v1 → v2: `accentColor` → `palette.primary`, `font` → `fontPairing`, `density` → `spacing` + `fontSize` (`compact` → compact/−1, `comfortable` → comfortable/+1). Both were explicit choices, so upgraded CVs keep their look.
- Enums (ids and French labels): `cvLayouts` (`single`, `sidebar-left`, `sidebar-right`, `split`, `banner`), `cvHeaderStyles` (`left`, `centered`, `inline`, `split`, `band`, `sidebar`), `cvSectionTitleStyles` (`rule`, `underline`, `block`, `bar`, `plain`), `cvItemStyles` (`dates-right`, `dates-below`, `compact`, `timeline`), `cvBulletStyles` (`dot`, `dash`, `none`), `cvSkillStyles` (`inline`, `list`, `tags`, `bars`, `dots`), `cvLanguageStyles` (`inline`, `list`, `bars`, `dots`, `cefr`), `cvLineHeights`, `cvSpacings`, `cvMargins`, `cvPageFormats`. **Additions to the plan**: `itemStyle`, `bulletStyle` and `layout` are overridable too (the plan listed them as template-only). **Not done**: `photo` overrides in the design — shape, size and position live in `content.header.photo` (one place).
- Font pairings: `cvFontPairingIds` / `cvFontPairings` (label, description, heading family, body family): `inter`, `lato` (Carlito files, see DECISIONS), `source-serif`, `source`, `playfair-source-sans`, `montserrat-open-sans`, `lora-source-sans`, `eb-garamond`, `ibm-plex`, `poppins-inter`. Families: `cvFontFamilies`.
- **A template is data**: `CvTemplateMeta = { id, label, description, category: 'ats'|'moderne'|'creatif'|'une-page', atsLevel: 'optimal'|'bon'|'limite', atsNote, defaults: CvDesignTokens, typography: { baseSize, nameSize, titleSize, sidebarWidth, sideSections } }`, in `cvTemplates` (`cv-templates.ts`), ids in `cvTemplateIds`. Template palette colors are `#rrggbb` or `{ tint }` (a tint of the resolved primary, so derived colors follow the user's accent). No template has code of its own. **Deviation**: the plan's `layout` field is `defaults.layout` (overridable).
- `resolveCvDesign(template, design): ResolvedCvDesign` — pure, tested; what the renderer and live checks use. `isTwoColumnLayout(layout)`.

### 5.3 Operations v2 (`cv-operations.ts`)

New typed operations: `set_skill_level { itemId, skillId, level }`, `set_language_cefr { itemId, cefr | null }`, `add_custom_section { title, position, items }`, `remove_custom_section { customId }`, `set_custom_item { customId, itemId, field, value }`, `add_custom_item { customId, position, item }`, `remove_custom_item`, `move_custom_item`. `set_section` and `move_section` take `section: CvSectionKey | 'custom'` + `customId` (nullish, so stored v1 proposals still parse); `set_section` gains `column` (nullish). `set_skills` keeps the id and level of skills whose name is kept. New sections work with the generic `add_item` / `set_field` / `remove_item` / `move_item` and, for volunteering, the bullet operations.

Wire (`CvOperationWire`, still one flat object with nullable fields): new fields `customId`, `level`, `column`; `set_skill_level` uses `bulletId` for the skill id, `set_language_cefr` and `add_custom_section` use `value`, `add_custom_section` takes item titles in `list`. `parseCvEditOutput` accepts answers without the new fields. The edit prompt's operation list mentions the new operations (snapshot updated); WP3 owns the prompts beyond that.

### 5.4 `@piston/cv-render` (`packages/cv-render`)

```ts
render(input: CvRenderInput, assets?: CvAssets): TDocumentDefinitions        // pure
renderResolved(content, design: ResolvedCvDesign, assets?): TDocumentDefinitions // e.g. auto-fit
renderPdf(input, assets, { pdfmake, loadFont }): Promise<CvRenderResult>
// CvRenderInput = { content: CvContent; design: CvDesign; templateId: CvTemplateId }
// CvAssets = { images?: Record<assetId, dataUrl> }   PNG/JPEG only (pdfkit); WebP is ignored
// CvRenderResult = { pdf: Uint8Array, pageCount, pageSize, boxes: CvContentBox[], lastPageFill }
// CvContentBox = { id, page, x, y, width, height }   PDF points, top-left origin
prepareCvPdfMake(pdfmake, families, loadFont)   // called by renderPdf; fonts + no URL/file access
cvFontFiles(families?), cvPairingFamilies(pairing), cvFontFamilyName(family)
cvContentId.{header(field), contact, link(id), photo, section(ref), summary, item(id), bullet(id), skill(id)}
parseCvContentId(id) → { kind: 'header'|'link'|'section'|'summary'|'item'|'bullet'|'skill', … }
```

- `@piston/cv-render/node`: `CV_FONTS_DIR`, `nodeFontLoader(dir?)` (tests, scripts; the Nuxt server uses Nitro assets instead).
- Engine files: `src/render.ts` (layouts), `src/engine/header.ts` (header styles, photo, contact), `src/engine/sections.ts` (section titles, item styles, bullets, skills, languages, simple lines), `src/engine/tokens.ts` (numeric tokens: sizes from `typography` × font size step ±6 %, spacing factors 0.72/1/1.3, margins, line heights, page sizes), `src/engine/icons.ts` (Lucide paths, ISC license next to it).
- Two-column layouts: the side column shows the sections whose `column` is `side`, or `auto` and listed in the template's `sideSections`; custom sections default to main. With the `sidebar` header style, the contact details (and photo) go to the top of the side column; name and title stay above the main column, first in reading order. Narrow columns stack items (dates under the title). A dark `sidebarBg` switches the side column's text to white.
- **Content boxes (click-to-edit)**: pdfmake 0.3 lays out the definition's node objects in place and records each line's position on them (`node.positions`). The renderer tags nodes with a `cvBox` property; `renderPdf` walks the definition after `getBuffer()` and builds the boxes. No pdf.js fallback was needed. Nested boxes: take the smallest box containing the click. Widths are the column's, heights estimated for the last line: fine for hit-testing, not pixel-exact.
- Section titles are kept with their first item by pdfmake's `pageBreakBefore` (pdfmake ids `cv-title:<ref>` / `cv-first:<ref>`), **not** `unbreakable`, whose nodes keep trial-layout positions and broke the boxes.
- Fonts: 36 WOFF files, 11 families, **1.7 MB in total**; a pairing is one or two families, 120–350 KB loaded by the browser on first use. Rebuilt by `packages/cv-render/scripts/build-fonts.sh` (Google Fonts static TTF, Fontsource's latin + latin-ext ranges, `pyftsubset`, no hinting).

### 5.5 Browser preview (apps/web)

- `app/workers/cv-render.worker.ts` + `app/workers/cv-render-protocol.ts`: requests `{ type: 'render', id, channel, input, assets }`, answers `rendered` (result transferred) / `skipped` (a newer request of the same channel replaced it) / `error`. Latest wins **per channel**: the preview uses `preview`; WP1's thumbnails should use one channel per template (`thumb:<id>`).
- `useCvRenderWorker()` (one worker per page, ref-counted): `render(input, assets, channel)` → result or null (skipped). `useCvPreview(() => input, () => assets)`: debounced 150 ms, `{ result, status: 'warming'|'rendering'|'ready'|'error', error, refresh }`.
- `CvPdfPreview`: `data` (bytes) or `src` (URL, kept for the gallery's server thumbnails), skeleton until the first page, `busy`, emits `pages` and `point({ page, x, y })` (PDF points) on click, draws `highlight: CvContentBox[]`. WP2 wires click-to-edit with `result.boxes` and `parseCvContentId`.
- The editor shows the page count and, when the last page is under 25 % full, how close the CV is to one page less.
- Measured: worker chunk 921 KB (331 KB gzip, pdfmake included, loaded only by the editor page); first render ~350 ms in dev (pdfmake + fonts from cache), then ~250 ms per render in dev; a new pairing adds ~200 ms once.

### 5.6 Server and storage

- `server/utils/cv-pdf.ts`: `renderCvPdf(input, assets?)` (semaphore: 2 renders at a time), `renderCvDocumentPdf(userId, document)` (loads the photo), `cvPdfFilename`. Fonts from `useStorage('assets:cv-fonts')` (`nitro.serverAssets` → `packages/cv-render/fonts`), verified with `nuxt build` + `.output`: PDF rendered, fonts embedded, `/cv-fonts/*` served with `Cache-Control: public, max-age=2592000, immutable`.
- Migration `0006_cv_document_assets`: `cv_document_assets (id, created_at, document_id → cv_documents cascade, user_id → users cascade, mime_type, bytes bytea, width, height)`.
- `server/utils/cv-assets.ts`: `sniffImage(bytes)` (PNG/JPEG/WebP magic bytes and dimensions), `saveCvAsset(userId, documentId, bytes)` (≤ `CV_ASSET_MAX_BYTES` = 2 MB, 413/400/404 in French), `getCvAsset(userId, documentId, assetId)`, `cvAssetDataUrl(row)`, `loadCvRenderAssets(userId, documentId, content)`. The upload/download routes are WP2's: upload a **JPEG** (pdfkit cannot embed WebP; a WebP photo is stored but not drawn).
- Duplicating a document copies its photo asset. The account export lists assets (type, size, dimensions) without their bytes, like resume PDFs; CV documents are exported as stored (possibly v1). The JSON export (`/export?format=json`) is `version: 2`.
- `Dockerfile`: copies `packages/cv-render/package.json` for the frozen install (Docker build itself not run: WP5).

### 5.7 What each work package should know

- **WP1 (templates, design studio)**: add a template = an id in `cvTemplateIds` + an entry in `cvTemplates` (CONTRIBUTING « Adding a CV template »). New block styles go in `packages/cv-render/src/engine/*` with their id added to the enum in `cv-design.ts`, a French label, and a test in `packages/cv-render/test/render.test.ts` (« renders every style »). Thumbnails: `useCvRenderWorker().render(input, assets, 'thumb:<id>')`. The current `DesignPanel` is a minimal port (accent, pairing, spacing, language) to replace.
- **WP2 (editor)**: `ContentEditor` does not show custom sections yet (they render and Claude can edit them); new sections appear hidden with the generic `ItemsEditor`; skills are edited by name (levels kept). Photo: routes on top of `saveCvAsset` / `getCvAsset`, then `content.header.photo`, and pass the photo as a data URL in the preview's `assets`. Click-to-edit: `CvPdfPreview` `point` + `result.boxes` + `parseCvContentId`.
- **WP3 (AI)**: operations above; design operations are new work. The document sent to Claude is v2 (more fields: `version`, `photo`, `column`, `custom`).
- **WP4 (exports)**: `render()` gives a definition to reuse for a letter's header; `cvToText` / `cvToMarkdown` cover every section.

### 5.8 Not verified in WP0

The Docker image, a phone-sized viewport, Safari's module workers (supported since 15), real Claude answers with the new wire fields, a WebP upload end to end (no upload route yet).
