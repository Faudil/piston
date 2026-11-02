import { and, apiUsage, asc, count, eq, gte, sql, sum, users } from '@piston/db'
import {
  LIMITS,
  RESERVATION_TOKENS,
  TAVILY_CREDITS_PER_CALL,
  estimateCostMicros,
  type ApiProvider,
  type ClaudeUsage,
  type UsageStatus,
  type UsageSummary,
} from '@piston/shared'

/**
 * Usage ledger: every Claude and Tavily call is reserved BEFORE it starts and
 * settled afterwards, and all spending limits are computed from the ledger.
 *
 * - A reservation is a `reserved` row holding a conservative estimate (for
 *   Claude: RESERVATION_TOKENS at the price of the configured model; for
 *   Tavily: TAVILY_CREDITS_PER_CALL). It counts immediately, so a call that is
 *   aborted, fails, or whose process dies keeps costing its estimate.
 * - Settling replaces the estimate with the real numbers (see settleUsage).
 * - Checks and insert run in one transaction under a Postgres advisory lock,
 *   so concurrent requests cannot all pass the check and overshoot a limit.
 *
 * This is a guard against abuse and bugs, not accounting: the real hard stop
 * is the spend limit set at the providers (see docs/GETTING_STARTED.md).
 */

const DAY_MS = 24 * 60 * 60 * 1000
const MICROS_PER_USD = 1_000_000
/** Share of the monthly budget at which a warning is logged. */
const WARN_RATIO = 0.8
/**
 * What an aborted call takes from the user's own quota. Its real cost is
 * unknown and the reserved estimate, right for the server's budget, would make
 * « Arrêter » cost several real calls.
 */
const ABORTED_USER_COST_MICROS = 30_000

/** One advisory-lock key per provider: the two budgets are independent. */
const LOCK_KEYS: Record<ApiProvider, number> = { anthropic: 4_217_001, tavily: 4_217_002 }
/** Advisory-lock key serializing invite creation (see createInviteWithQuota). */
export const INVITE_LOCK_KEY = 4_217_003

/** Start of the current calendar month, in UTC (how Anthropic and Tavily bill). */
function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

interface ProviderLimits {
  perUserDaily: number
  globalDaily: number
  /** Monthly budget in the provider's unit: micro-dollars (anthropic) or credits (tavily). */
  monthlyBudget: number
}

function limitsOf(provider: ApiProvider): ProviderLimits {
  const config = useRuntimeConfig()
  if (provider === 'anthropic') {
    return {
      perUserDaily: config.dailyGenerationLimit,
      globalDaily: config.claudeGlobalDailyLimit,
      monthlyBudget: Math.round(config.claudeMonthlyBudgetUsd * MICROS_PER_USD),
    }
  }
  return {
    perUserDaily: LIMITS.webCallsPerUserPerDay,
    globalDaily: config.tavilyGlobalDailyLimit,
    monthlyBudget: config.tavilyMonthlyCredits,
  }
}

/** The ledger column the monthly budget is measured in. */
function spendColumn(provider: ApiProvider) {
  return provider === 'anthropic' ? apiUsage.estimatedCostMicros : apiUsage.credits
}

/** What a reservation is worth until it is settled, in the budget's unit. */
function reservationEstimate(provider: ApiProvider, operation: string) {
  if (provider === 'tavily') {
    return { credits: TAVILY_CREDITS_PER_CALL, estimatedCostMicros: 0, model: null }
  }
  const model = claudeModelFor(operation)
  const tokens =
    operation === 'import_offer' ? RESERVATION_TOKENS.import_offer : RESERVATION_TOKENS.generation
  return {
    credits: 0,
    estimatedCostMicros: estimateCostMicros(model, tokens),
    model,
  }
}

/** Anything that can run the ledger queries: the database or an open transaction. */
type LedgerReader = Pick<ReturnType<typeof useDb>, 'select'>

/**
 * A user's Claude quota over the last 24 hours. It is measured in estimated
 * cost, so a light task weighs little and a full letter more; the cap on calls
 * only stops abuse of the cheap tasks, which still count against the server's
 * global daily limit. Failed calls don't count: they are not the user's doing.
 */
async function claudeQuota(db: LedgerReader, userId: string, now: Date) {
  const rows = await db
    .select({
      createdAt: apiUsage.createdAt,
      status: apiUsage.status,
      cost: apiUsage.estimatedCostMicros,
    })
    .from(apiUsage)
    .where(
      and(
        eq(apiUsage.userId, userId),
        eq(apiUsage.provider, 'anthropic'),
        gte(apiUsage.createdAt, new Date(now.getTime() - DAY_MS)),
        sql`${apiUsage.status} <> 'failed'`,
      ),
    )
    .orderBy(asc(apiUsage.createdAt))
  const charges = rows.map((row) =>
    row.status === 'aborted' ? Math.min(row.cost, ABORTED_USER_COST_MICROS) : row.cost,
  )

  const config = useRuntimeConfig()
  const defaultBudget = Math.round(config.userDailyBudgetUsd * MICROS_PER_USD)
  const [member] = await db
    .select({ budget: users.aiDailyBudgetMicros })
    .from(users)
    .where(eq(users.id, userId))
  const budget = member?.budget ?? defaultBudget
  // A raised budget raises the cap on calls too, or it would stay out of reach.
  const raise = defaultBudget > 0 ? Math.max(1, budget / defaultBudget) : 1
  const limit = Math.ceil(config.dailyGenerationLimit * raise)
  const spent = charges.reduce((total, charge) => total + charge, 0)
  const exhausted = rows.length >= limit || spent >= budget

  // The window slides: the quota opens again once enough old calls have left it.
  let resetsAt: Date | null = null
  if (exhausted) {
    let calls = rows.length
    let left = spent
    for (const [i, row] of rows.entries()) {
      calls -= 1
      left -= charges[i]!
      if (calls < limit && left < budget) {
        resetsAt = new Date(row.createdAt.getTime() + DAY_MS)
        break
      }
    }
  }

  const remaining = budget > 0 ? Math.min(1 - spent / budget, 1 - rows.length / limit) : 0
  return {
    used: rows.length,
    limit,
    remainingPercent: Math.max(0, Math.floor(remaining * 100)),
    exhausted,
    resetsAt,
  }
}

/** « 3 h 20 » or « 45 min », without a clock time: the server doesn't know the user's time zone. */
function formatDelay(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  return `${Math.floor(minutes / 60)} h${rest ? ` ${String(rest).padStart(2, '0')}` : ''}`
}

/** Months (per provider) for which the 80 % warning was already logged by this process. */
const warnedMonths = new Set<string>()

function warnIfNearBudget(provider: ApiProvider, spent: number, budget: number) {
  if (budget <= 0 || spent < budget * WARN_RATIO) return
  const month = monthStart().toISOString().slice(0, 7)
  const key = `${provider}:${month}`
  if (warnedMonths.has(key)) return
  warnedMonths.add(key)
  const percent = Math.round((spent / budget) * 100)
  console.warn(`[usage] ${provider} monthly budget is ${percent}% used (${month})`)
}

/** Forgets which warnings were logged. Used by tests. */
export function resetUsageWarnings() {
  warnedMonths.clear()
}

/**
 * Checks every limit and records a `reserved` row; returns its id, to pass to
 * settleUsage once the call is over. Throws a French h3 error when:
 * - the user used their own quota over 24 hours (429, see claudeQuota),
 * - the server used its global daily quota (429),
 * - the call could push this month's estimated spend over the budget (503).
 *
 * Global counts include every row of the window whatever its status.
 */
export async function reserveUsage(
  userId: string,
  provider: ApiProvider,
  operation: string,
): Promise<string> {
  const limits = limitsOf(provider)
  const estimate = reservationEstimate(provider, operation)
  const spend = spendColumn(provider)
  const now = new Date()
  const since = new Date(now.getTime() - DAY_MS)

  const result = await useDb().transaction(async (tx) => {
    // Held until the transaction ends: later reservations of this provider
    // wait here, then see this row when they count.
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_KEYS[provider]}::bigint)`)

    if (provider === 'anthropic') {
      const quota = await claudeQuota(tx, userId, now)
      if (quota.exhausted) {
        const delay = quota.resetsAt ? quota.resetsAt.getTime() - now.getTime() : DAY_MS
        throw createError({
          statusCode: 429,
          message: `Tu as utilisé tout ton quota de génération. Il se libère dans environ ${formatDelay(delay)}.`,
        })
      }
    } else {
      const [userRow] = await tx
        .select({ total: count() })
        .from(apiUsage)
        .where(
          and(
            eq(apiUsage.userId, userId),
            eq(apiUsage.provider, provider),
            gte(apiUsage.createdAt, since),
          ),
        )
      if ((userRow?.total ?? 0) >= limits.perUserDaily) {
        throw createError({
          statusCode: 429,
          message: `Tu as atteint la limite de ${limits.perUserDaily} recherches web sur 24 heures. Reviens demain !`,
        })
      }
    }

    const [globalRow] = await tx
      .select({ total: count() })
      .from(apiUsage)
      .where(and(eq(apiUsage.provider, provider), gte(apiUsage.createdAt, since)))
    if ((globalRow?.total ?? 0) >= limits.globalDaily) {
      throw createError({
        statusCode: 429,
        message: 'Le quota quotidien du serveur est atteint, réessaie demain.',
      })
    }

    // sum() returns a numeric string; coalesce + cast gives a JS number.
    const [monthRow] = await tx
      .select({ spent: sql<number>`coalesce(${sum(spend)}, 0)::float8` })
      .from(apiUsage)
      .where(and(eq(apiUsage.provider, provider), gte(apiUsage.createdAt, monthStart(now))))
    const spent = Number(monthRow?.spent ?? 0)
    const cost = provider === 'anthropic' ? estimate.estimatedCostMicros : estimate.credits
    if (spent + cost > limits.monthlyBudget) {
      throw createError({
        statusCode: 503,
        message: "Le budget mensuel de l'IA de ce serveur est atteint. Préviens l'administrateur.",
      })
    }

    const [row] = await tx
      .insert(apiUsage)
      .values({ userId, provider, operation, status: 'reserved', ...estimate })
      .returning({ id: apiUsage.id })
    return { id: row!.id, spentAfter: spent + cost }
  })

  warnIfNearBudget(provider, result.spentAfter, limits.monthlyBudget)
  return result.id
}

/** What a finished call reports. Omit both `usage` and `credits` to keep the reserved estimate. */
export interface SettleOptions {
  status: Exclude<UsageStatus, 'reserved'>
  /** Claude token counts. */
  usage?: ClaudeUsage
  /** Model that actually answered (differs from the configured one after a fallback). */
  model?: string
  /** Tavily credits actually used. */
  credits?: number
}

/**
 * Closes a reservation. With real numbers (`usage` or `credits`) they replace
 * the estimate; without them (aborted or failed calls, whose cost is unknown)
 * the conservative estimate stays, so such calls are never free. Never throws:
 * a ledger hiccup must not break an answer the user already paid for.
 */
export async function settleUsage(id: string, options: SettleOptions): Promise<void> {
  try {
    const patch: Partial<typeof apiUsage.$inferInsert> = { status: options.status }
    if (options.usage) {
      const { usage } = options
      const row = await useDb().query.apiUsage.findFirst({ where: eq(apiUsage.id, id) })
      const model = options.model ?? row?.model
      Object.assign(patch, {
        model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        estimatedCostMicros: estimateCostMicros(model, usage),
      })
    }
    if (options.credits !== undefined) patch.credits = options.credits
    await useDb().update(apiUsage).set(patch).where(eq(apiUsage.id, id))
  } catch (error) {
    console.error('[usage] could not settle usage', id, error)
  }
}

/** Usage that costs nothing: for a reservation whose call never left the server. */
export const NO_USAGE: ClaudeUsage = { input_tokens: 0, output_tokens: 0 }

/** The user's own 24 h counts and limits, plus the server-wide monthly budget as percentages. */
export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const since = new Date(Date.now() - DAY_MS)
  const db = useDb()

  const dayCount = async (provider: ApiProvider) => {
    const [row] = await db
      .select({ total: count() })
      .from(apiUsage)
      .where(
        and(
          eq(apiUsage.userId, userId),
          eq(apiUsage.provider, provider),
          gte(apiUsage.createdAt, since),
        ),
      )
    return row?.total ?? 0
  }
  const monthPercent = async (provider: ApiProvider) => {
    const budget = limitsOf(provider).monthlyBudget
    const [row] = await db
      .select({ spent: sql<number>`coalesce(${sum(spendColumn(provider))}, 0)::float8` })
      .from(apiUsage)
      .where(and(eq(apiUsage.provider, provider), gte(apiUsage.createdAt, monthStart())))
    if (budget <= 0) return 100
    return Math.min(100, Math.round((Number(row?.spent ?? 0) / budget) * 100))
  }

  const quota = await claudeQuota(db, userId, new Date())
  return {
    claude: {
      used: quota.used,
      limit: quota.limit,
      remainingPercent: quota.remainingPercent,
      resetsAt: quota.resetsAt?.toISOString() ?? null,
    },
    web: { used: await dayCount('tavily'), limit: limitsOf('tavily').perUserDaily },
    monthlyPercent: { claude: await monthPercent('anthropic'), web: await monthPercent('tavily') },
  }
}
