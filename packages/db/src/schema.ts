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

export const resumes = pgTable(
  'resumes',
  {
    ...base,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    rawText: text('raw_text').notNull(),
    sourceFilename: text('source_filename'),
    // Original imported PDF (max 5 MB), null for pasted resumes. Never select it in list queries.
    sourcePdf: bytea('source_pdf'),
    isCurrent: boolean('is_current').notNull().default(false),
  },
  (t) => [
    index('resumes_user_idx').on(t.userId),
    // The database itself guarantees at most one current resume per user.
    uniqueIndex('resumes_one_current_per_user')
      .on(t.userId)
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

export type UserRow = typeof users.$inferSelect
export type InviteRow = typeof invites.$inferSelect
export type ResumeRow = typeof resumes.$inferSelect
export type JobOfferRow = typeof jobOffers.$inferSelect
export type GenerationRow = typeof generations.$inferSelect
export type ApplicationRow = typeof applications.$inferSelect
