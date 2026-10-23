import { sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import {
  applicationStatuses,
  generationKinds,
  type ApplicationOutcome,
  type CvAssetMimeType,
  type CvContent,
  type CvDesign,
  type CvRevisionSource,
  type CvTemplateId,
  type GenerationInputRefs,
  type GenerationOutputs,
  type StatusChange,
} from '@piston/shared'

/**
 * PostgreSQL `bytea`, which Drizzle has no built-in column for. Reads return a
 * Buffer (postgres.js) or a plain Uint8Array (PGlite in tests): both are
 * Uint8Array, which is the type exposed. Used to keep the imported CV PDF.
 */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
})

/** Columns shared by every table: a UUID primary key and two timestamps. */
const base = {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

export const generationKind = pgEnum('generation_kind', generationKinds)
export const applicationStatus = pgEnum('application_status', applicationStatuses)

export const users = pgTable('users', {
  ...base,
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
})

export const invites = pgTable('invites', {
  ...base,
  token: text('token').notNull().unique(),
  // Nullable so the very first invite can be created from the CLI, before any user exists.
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

/**
 * A resume per specialty (« Communication », « Marketing digital »...). Each
 * profile has its own versions and its own current version.
 */
export const resumeProfiles = pgTable(
  'resume_profiles',
  {
    ...base,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Used when no profile is chosen (offers without a profile, generations without one).
    isDefault: boolean('is_default').notNull().default(false),
  },
  (t) => [
    uniqueIndex('resume_profiles_user_name').on(t.userId, t.name),
    // The database itself guarantees at most one default profile per user.
    uniqueIndex('resume_profiles_one_default_per_user')
      .on(t.userId)
      .where(sql`${t.isDefault}`),
  ],
)

export const resumes = pgTable(
  'resumes',
  {
    ...base,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => resumeProfiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    rawText: text('raw_text').notNull(),
    sourceFilename: text('source_filename'),
    // Original imported PDF (max 5 MB), null for pasted resumes. Never select it in list queries.
    sourcePdf: bytea('source_pdf'),
    isCurrent: boolean('is_current').notNull().default(false),
  },
  (t) => [
    index('resumes_user_idx').on(t.userId),
    // The database itself guarantees at most one current resume per profile.
    uniqueIndex('resumes_one_current_per_profile')
      .on(t.profileId)
      .where(sql`${t.isCurrent}`),
  ],
)

export const jobOffers = pgTable(
  'job_offers',
  {
    ...base,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    company: text('company').notNull().default(''),
    rawText: text('raw_text').notNull(),
    url: text('url'),
    // The resume profile the offer is analyzed and written against; null = the default profile.
    profileId: uuid('profile_id').references(() => resumeProfiles.id, { onDelete: 'set null' }),
  },
  (t) => [index('job_offers_user_idx').on(t.userId)],
)

export const generations = pgTable(
  'generations',
  {
    ...base,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: generationKind('kind').notNull(),
    inputRefs: jsonb('input_refs').$type<GenerationInputRefs>().notNull().default({}),
    output: jsonb('output').$type<GenerationOutputs[keyof GenerationOutputs]>().notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
  },
  (t) => [index('generations_user_kind_idx').on(t.userId, t.kind, t.createdAt)],
)

export const applications = pgTable(
  'applications',
  {
    ...base,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobOfferId: uuid('job_offer_id')
      .notNull()
      .references(() => jobOffers.id, { onDelete: 'cascade' }),
    status: applicationStatus('status').notNull().default('to_send'),
    // Only set once the application is closed: did it end with an offer or a rejection?
    outcome: text('outcome').$type<ApplicationOutcome>(),
    notes: text('notes').notNull().default(''),
    statusHistory: jsonb('status_history').$type<StatusChange[]>().notNull().default([]),
  },
  (t) => [
    index('applications_user_idx').on(t.userId),
    // One application per offer (an offer already belongs to a single user).
    uniqueIndex('applications_one_per_offer').on(t.jobOfferId),
  ],
)

/**
 * A structured CV built in Piston (« Créer mon CV »), one per specialty or
 * per offer. Its content and design are validated by `CvContent` and
 * `CvDesign` (@piston/shared) on every write. See docs/design/cv-builder.md.
 *
 * The JSON may still be in the v1 schema (documents not saved since v2):
 * read it through `upgradeCvDocument` (@piston/shared), never as is. It is
 * rewritten as v2 on the next save; no migration touches it.
 */
export const cvDocuments = pgTable(
  'cv_documents',
  {
    ...base,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => resumeProfiles.id, { onDelete: 'cascade' }),
    // Set when the document is a copy tailored to an offer.
    offerId: uuid('offer_id').references(() => jobOffers.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    templateId: text('template_id').$type<CvTemplateId>().notNull().default('sobre'),
    content: jsonb('content').$type<CvContent>().notNull(),
    design: jsonb('design').$type<CvDesign>().notNull(),
  },
  (t) => [index('cv_documents_user_idx').on(t.userId, t.profileId)],
)

/** Full snapshots of a CV document, so the user can go back (capped per document). */
export const cvDocumentRevisions = pgTable(
  'cv_document_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Insertion order. created_at is not enough: Postgres' now() is the start
    // of the transaction, so a save that records the manual changes and then
    // an AI snapshot gives both revisions the exact same timestamp.
    seq: integer('seq').generatedAlwaysAsIdentity(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => cvDocuments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    source: text('source').$type<CvRevisionSource>().notNull(),
    // The Claude proposal whose edits were accepted, for AI revisions.
    generationId: uuid('generation_id').references(() => generations.id, { onDelete: 'set null' }),
    templateId: text('template_id').$type<CvTemplateId>().notNull(),
    content: jsonb('content').$type<CvContent>().notNull(),
    design: jsonb('design').$type<CvDesign>().notNull(),
  },
  (t) => [index('cv_document_revisions_document_idx').on(t.documentId, t.seq)],
)

/**
 * Binary files of a CV document: its photo. Deleted with the document (or
 * the user). Personal data: never sent to Claude, left out of the account
 * export's JSON like resume PDFs (the export lists them without bytes).
 */
export const cvDocumentAssets = pgTable(
  'cv_document_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => cvDocuments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Sniffed from the bytes (PNG, JPEG or WebP), never taken from the client.
    mimeType: text('mime_type').$type<CvAssetMimeType>().notNull(),
    // At most CV_ASSET_MAX_BYTES (2 MB). Never select it in list queries.
    bytes: bytea('bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
  },
  (t) => [index('cv_document_assets_document_idx').on(t.documentId)],
)

export type UserRow = typeof users.$inferSelect
export type InviteRow = typeof invites.$inferSelect
export type ResumeProfileRow = typeof resumeProfiles.$inferSelect
export type ResumeRow = typeof resumes.$inferSelect
export type JobOfferRow = typeof jobOffers.$inferSelect
export type GenerationRow = typeof generations.$inferSelect
export type ApplicationRow = typeof applications.$inferSelect
export type CvDocumentRow = typeof cvDocuments.$inferSelect
export type CvDocumentRevisionRow = typeof cvDocumentRevisions.$inferSelect
export type CvDocumentAssetRow = typeof cvDocumentAssets.$inferSelect
