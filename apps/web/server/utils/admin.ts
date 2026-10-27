import { randomBytes } from 'node:crypto'
import {
  accessRequests,
  and,
  apiUsage,
  applications,
  count,
  cvDocuments,
  desc,
  eq,
  generations,
  gte,
  invites,
  isNull,
  jobOffers,
  max,
  sql,
  users,
} from '@piston/db'
import { generatePassword } from '@piston/db/password'
import {
  LIMITS,
  type AccessRequestBody,
  type AccessRequestStatus,
  type AdminAccessRequest,
  type AdminDailyUsage,
  type AdminInvite,
  type AdminOverview,
  type AdminUser,
} from '@piston/shared'

/**
 * Everything behind /admin: access requests, accounts, invitations and the
 * totals dashboard. Routes call requireAdmin() first; these helpers trust
 * their caller.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const MICROS_PER_USD = 1_000_000

type DbTransaction = Parameters<Parameters<ReturnType<typeof useDb>['transaction']>[0]>[0]

const usd = (micros: number) => Math.round((micros / MICROS_PER_USD) * 100) / 100

/** Start of the current calendar month, in UTC (same window as the usage ledger). */
function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

// --- Access requests ----------------------------------------------------------

/**
 * Records a request to join. Answers the same way whether or not the address
 * already has an account or a pending request, so the form tells nobody who
 * is a member. Throws a 503 when too many requests are already waiting.
 */
export async function submitAccessRequest(body: AccessRequestBody) {
  const db = useDb()
  const existing = await db.query.users.findFirst({ where: eq(users.email, body.email) })
  if (existing) return

  const [pending] = await db
    .select({ total: count() })
    .from(accessRequests)
    .where(eq(accessRequests.status, 'pending'))
  if ((pending?.total ?? 0) >= LIMITS.maxPendingAccessRequests) {
    throw createError({
      statusCode: 503,
      message: 'Trop de demandes sont déjà en attente. Réessaie dans quelques jours.',
    })
  }

  const inserted = await db
    .insert(accessRequests)
    .values({
      email: body.email,
      displayName: body.displayName,
      message: body.message ?? null,
      passwordHash: await hashPassword(body.password),
    })
    // A second request for an address that is already waiting is dropped.
    .onConflictDoNothing()
    .returning({ id: accessRequests.id })
  if (inserted.length > 0) console.info('[access] new access request waiting for review')
}

/**
 * Whether `email` has a pending request whose password is `password`: the
 * login route then says « en attente » instead of « mot de passe incorrect ».
 */
export async function hasPendingRequest(email: string, password: string) {
  const request = await useDb().query.accessRequests.findFirst({
    where: and(eq(accessRequests.email, email), eq(accessRequests.status, 'pending')),
  })
  return !!request?.passwordHash && (await verifyPassword(request.passwordHash, password))
}

export async function listAccessRequests(
  status?: AccessRequestStatus,
): Promise<AdminAccessRequest[]> {
  const reviewer = sql<
    string | null
  >`(select ${users.displayName} from ${users} where ${users.id} = ${accessRequests.reviewedBy})`
  const rows = await useDb()
    .select({
      id: accessRequests.id,
      email: accessRequests.email,
      displayName: accessRequests.displayName,
      message: accessRequests.message,
      status: accessRequests.status,
      createdAt: accessRequests.createdAt,
      reviewedAt: accessRequests.reviewedAt,
      reviewedBy: reviewer,
    })
    .from(accessRequests)
    .where(status ? eq(accessRequests.status, status) : undefined)
    .orderBy(desc(accessRequests.createdAt))
    .limit(200)
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  }))
}

/** Locks a pending request for review, or throws (404 unknown, 409 already reviewed). */
async function lockPending(tx: DbTransaction, id: string) {
  const [request] = await tx
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.id, id))
    .for('update')
  if (!request) throw createError({ statusCode: 404, message: 'Demande introuvable.' })
  if (request.status !== 'pending') {
    throw createError({ statusCode: 409, message: 'Cette demande a déjà été traitée.' })
  }
  return request
}

/**
 * Creates the account with the password the requester chose. When the
 * address got an account in the meantime (an invitation), the request is
 * closed as rejected and a 409 explains why.
 */
export async function approveAccessRequest(id: string, adminId: string) {
  return useDb().transaction(async (tx) => {
    const request = await lockPending(tx, id)
    const reviewed = { passwordHash: null, reviewedBy: adminId, reviewedAt: new Date() }

    const existing = await tx.query.users.findFirst({ where: eq(users.email, request.email) })
    if (existing || !request.passwordHash) {
      await tx
        .update(accessRequests)
        .set({ ...reviewed, status: 'rejected' })
        .where(eq(accessRequests.id, id))
      return { conflict: true as const }
    }

    const [user] = await tx
      .insert(users)
      .values({
        email: request.email,
        displayName: request.displayName,
        passwordHash: request.passwordHash,
      })
      .returning({ id: users.id })
    await tx
      .update(accessRequests)
      .set({ ...reviewed, status: 'approved', userId: user!.id })
      .where(eq(accessRequests.id, id))
    return { conflict: false as const, userId: user!.id }
  })
}

export async function rejectAccessRequest(id: string, adminId: string) {
  await useDb().transaction(async (tx) => {
    await lockPending(tx, id)
    await tx
      .update(accessRequests)
      .set({ status: 'rejected', passwordHash: null, reviewedBy: adminId, reviewedAt: new Date() })
      .where(eq(accessRequests.id, id))
  })
}

export async function countPendingRequests() {
  const [row] = await useDb()
    .select({ total: count() })
    .from(accessRequests)
    .where(eq(accessRequests.status, 'pending'))
  return row?.total ?? 0
}

// --- Accounts -----------------------------------------------------------------

/** Every account with its activity, newest first. */
export async function listAdminUsers(): Promise<AdminUser[]> {
  const db = useDb()
  const since = new Date(Date.now() - 30 * DAY_MS)

  // One grouped query per table, merged below: simpler to read (and to plan)
  // than a correlated subquery per column.
  const countsBy = async (
    table: typeof jobOffers | typeof applications | typeof cvDocuments | typeof generations,
  ) => {
    const rows = await db
      .select({ userId: table.userId, total: count() })
      .from(table)
      .groupBy(table.userId)
    return new Map(rows.map((row) => [row.userId, row.total]))
  }
  const [rows, offers, applicationCounts, cvCounts, generationCounts, usageRows, lastActive] =
    await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          isAdmin: users.isAdmin,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt)),
      countsBy(jobOffers),
      countsBy(applications),
      countsBy(cvDocuments),
      countsBy(generations),
      db
        .select({
          userId: apiUsage.userId,
          provider: apiUsage.provider,
          calls: count(),
          costMicros: sql<number>`coalesce(sum(${apiUsage.estimatedCostMicros}), 0)::float8`,
        })
        .from(apiUsage)
        .where(gte(apiUsage.createdAt, since))
        .groupBy(apiUsage.userId, apiUsage.provider),
      db
        .select({ userId: apiUsage.userId, at: max(apiUsage.createdAt) })
        .from(apiUsage)
        .groupBy(apiUsage.userId),
    ])

  const usageOf = (userId: string, provider: 'anthropic' | 'tavily') =>
    usageRows.find((row) => row.userId === userId && row.provider === provider)
  const lastActiveOf = new Map(lastActive.map((row) => [row.userId, row.at]))

  return rows.map((row) => {
    const claude = usageOf(row.id, 'anthropic')
    const lastActiveAt = lastActiveOf.get(row.id)
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      isAdmin: row.isAdmin,
      createdAt: row.createdAt.toISOString(),
      lastActiveAt: lastActiveAt ? new Date(lastActiveAt).toISOString() : null,
      counts: {
        offers: offers.get(row.id) ?? 0,
        applications: applicationCounts.get(row.id) ?? 0,
        cvDocuments: cvCounts.get(row.id) ?? 0,
        generations: generationCounts.get(row.id) ?? 0,
      },
      claude30d: { calls: claude?.calls ?? 0, costUsd: usd(Number(claude?.costMicros ?? 0)) },
      web30d: { calls: usageOf(row.id, 'tavily')?.calls ?? 0 },
    }
  })
}

/** Grants or removes the admin role. An admin cannot demote themselves (no lock-out). */
export async function setAdmin(targetId: string, isAdmin: boolean, adminId: string) {
  if (targetId === adminId && !isAdmin) {
    throw createError({ statusCode: 400, message: 'Tu ne peux pas retirer ton propre rôle.' })
  }
  const updated = await useDb()
    .update(users)
    .set({ isAdmin })
    .where(eq(users.id, targetId))
    .returning({ id: users.id })
  if (updated.length === 0) throw createError({ statusCode: 404, message: 'Membre introuvable.' })
}

/**
 * Replaces a member's password with a temporary one, returned once, and
 * closes all their sessions.
 */
export async function resetMemberPassword(targetId: string) {
  const password = generatePassword()
  const updated = await useDb()
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.id, targetId))
    .returning({ id: users.id })
  if (updated.length === 0) throw createError({ statusCode: 404, message: 'Membre introuvable.' })
  return password
}

/** Deletes an account and its data (by cascade). Not one's own: that is « Mon compte ». */
export async function deleteMember(targetId: string, adminId: string) {
  if (targetId === adminId) {
    throw createError({
      statusCode: 400,
      message: 'Supprime ton propre compte depuis « Mon compte ».',
    })
  }
  const deleted = await useDb()
    .delete(users)
    .where(eq(users.id, targetId))
    .returning({ id: users.id })
  if (deleted.length === 0) throw createError({ statusCode: 404, message: 'Membre introuvable.' })
}

// --- Invitations --------------------------------------------------------------

export async function listAdminInvites(): Promise<AdminInvite[]> {
  const now = new Date()
  const rows = await useDb()
    .select({
      id: invites.id,
      createdAt: invites.createdAt,
      expiresAt: invites.expiresAt,
      usedAt: invites.usedAt,
      createdBy: users.displayName,
    })
    .from(invites)
    .leftJoin(users, eq(users.id, invites.createdBy))
    .orderBy(desc(invites.createdAt))
    .limit(100)
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    usedAt: row.usedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    status: row.usedAt ? 'used' : row.expiresAt < now ? 'expired' : 'active',
  }))
}

/** An invitation created by an admin: not counted against the weekly quota. */
export async function createAdminInvite(adminId: string) {
  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + LIMITS.inviteValidityDays * DAY_MS)
  const [invite] = await useDb()
    .insert(invites)
    .values({ token, createdBy: adminId, expiresAt })
    .returning()
  return invite!
}

/** Deletes an invitation that was not used yet; used ones stay as history. */
export async function revokeInvite(id: string) {
  const deleted = await useDb()
    .delete(invites)
    .where(and(eq(invites.id, id), isNull(invites.usedAt)))
    .returning({ id: invites.id })
  if (deleted.length === 0) {
    throw createError({ statusCode: 404, message: 'Invitation introuvable ou déjà utilisée.' })
  }
}

// --- Totals -------------------------------------------------------------------

export async function getAdminOverview(): Promise<AdminOverview> {
  const db = useDb()
  const config = useRuntimeConfig()
  const now = new Date()
  const dayAgo = new Date(now.getTime() - DAY_MS)
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS)
  const month = monthStart(now)
  const firstDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 29 * DAY_MS,
  )

  const total = async (query: Promise<{ total: number }[]>) => (await query)[0]?.total ?? 0

  const [
    usersTotal,
    admins,
    activeUsers7d,
    pendingRequests,
    activeInvites,
    offers,
    applicationsTotal,
    cvDocumentsTotal,
    letters,
    generationsTotal,
  ] = await Promise.all([
    total(db.select({ total: count() }).from(users)),
    total(db.select({ total: count() }).from(users).where(eq(users.isAdmin, true))),
    total(
      db
        .select({ total: sql<number>`count(distinct ${apiUsage.userId})::int` })
        .from(apiUsage)
        .where(gte(apiUsage.createdAt, weekAgo)),
    ),
    countPendingRequests(),
    total(
      db
        .select({ total: count() })
        .from(invites)
        .where(and(isNull(invites.usedAt), gte(invites.expiresAt, now))),
    ),
    total(db.select({ total: count() }).from(jobOffers)),
    total(db.select({ total: count() }).from(applications)),
    total(db.select({ total: count() }).from(cvDocuments)),
    total(
      db.select({ total: count() }).from(generations).where(eq(generations.kind, 'cover_letter')),
    ),
    total(db.select({ total: count() }).from(generations)),
  ])

  const statusRows = await db
    .select({ status: applications.status, total: count() })
    .from(applications)
    .groupBy(applications.status)

  // One pass over the ledger window per provider and period.
  const usageSince = (provider: 'anthropic' | 'tavily', since: Date) =>
    db
      .select({
        calls: count(),
        costMicros: sql<number>`coalesce(sum(${apiUsage.estimatedCostMicros}), 0)::float8`,
        credits: sql<number>`coalesce(sum(${apiUsage.credits}), 0)::float8`,
      })
      .from(apiUsage)
      .where(and(eq(apiUsage.provider, provider), gte(apiUsage.createdAt, since)))
      .then((rows) => rows[0] ?? { calls: 0, costMicros: 0, credits: 0 })

  const [claudeToday, claudeMonth, webToday, webMonth] = await Promise.all([
    usageSince('anthropic', dayAgo),
    usageSince('anthropic', month),
    usageSince('tavily', dayAgo),
    usageSince('tavily', month),
  ])

  const byOperation = await db
    .select({
      operation: apiUsage.operation,
      calls: count(),
      costMicros: sql<number>`coalesce(sum(${apiUsage.estimatedCostMicros}), 0)::float8`,
    })
    .from(apiUsage)
    .where(and(eq(apiUsage.provider, 'anthropic'), gte(apiUsage.createdAt, month)))
    .groupBy(apiUsage.operation)

  const dayColumn = sql<string>`to_char(${apiUsage.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`
  const dailyRows = await db
    .select({
      day: dayColumn,
      provider: apiUsage.provider,
      calls: count(),
      costMicros: sql<number>`coalesce(sum(${apiUsage.estimatedCostMicros}), 0)::float8`,
    })
    .from(apiUsage)
    .where(gte(apiUsage.createdAt, firstDay))
    .groupBy(dayColumn, apiUsage.provider)

  const daily: AdminDailyUsage[] = Array.from({ length: 30 }, (_, i) => ({
    day: new Date(firstDay.getTime() + i * DAY_MS).toISOString().slice(0, 10),
    claudeCalls: 0,
    claudeCostUsd: 0,
    webCalls: 0,
  }))
  const byDay = new Map(daily.map((entry) => [entry.day, entry]))
  for (const row of dailyRows) {
    const entry = byDay.get(row.day)
    if (!entry) continue
    if (row.provider === 'anthropic') {
      entry.claudeCalls = row.calls
      entry.claudeCostUsd = usd(Number(row.costMicros))
    } else {
      entry.webCalls = row.calls
    }
  }

  return {
    totals: {
      users: usersTotal,
      admins,
      activeUsers7d,
      pendingRequests,
      activeInvites,
      offers,
      applications: applicationsTotal,
      cvDocuments: cvDocumentsTotal,
      letters,
      generations: generationsTotal,
    },
    applicationsByStatus: Object.fromEntries(statusRows.map((row) => [row.status, row.total])),
    claude: {
      today: { calls: claudeToday.calls, limit: config.claudeGlobalDailyLimit },
      month: {
        costUsd: usd(Number(claudeMonth.costMicros)),
        budgetUsd: config.claudeMonthlyBudgetUsd,
        calls: claudeMonth.calls,
      },
      byOperation: byOperation
        .map((row) => ({
          operation: row.operation,
          calls: row.calls,
          costUsd: usd(Number(row.costMicros)),
        }))
        .sort((a, b) => b.costUsd - a.costUsd),
    },
    web: {
      today: { calls: webToday.calls, limit: config.tavilyGlobalDailyLimit },
      month: {
        credits: Math.round(Number(webMonth.credits) * 10) / 10,
        budget: config.tavilyMonthlyCredits,
        calls: webMonth.calls,
      },
    },
    daily,
  }
}
