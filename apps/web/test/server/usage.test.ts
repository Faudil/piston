import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiUsage, invites, users } from '@piston/db'
import { estimateCostMicros, RESERVATION_TOKENS } from '@piston/shared'
import createInviteRoute from '../../server/api/invites.post'
import usageRoute from '../../server/api/usage.get'
import searchRoute from '../../server/api/jobs/search.post'
import { testState } from './state'
import {
  callRoute,
  loginAsNewUser,
  mockClaude,
  readSse,
  resetTestState,
  seedUsage,
} from './helpers'

beforeEach(async () => {
  await resetTestState()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

const ledger = () => testState.db.query.apiUsage.findMany()

/** A minimal generation route: the same streamGeneration path as the real ones. */
const generateRoute = defineEventHandler((event) =>
  streamGeneration(event, {
    kind: 'offer_analysis',
    userId: testState.user!.id,
    system: 'system',
    resume: '<cv>cv</cv>',
    request: 'go',
    inputRefs: {},
    output: { fromText: (text) => ({ text }) as never },
  }),
)
const generate = () => callRoute(generateRoute, { method: 'POST', path: '/api/generate/test' })

async function createUser(email: string) {
  const [user] = await testState.db
    .insert(users)
    .values({ email, displayName: 'X', passwordHash: 'x' })
    .returning()
  return user!
}

describe('reserveUsage', () => {
  it('reserves a light task at the fast model price, a main task at the main model price', async () => {
    const { user } = await loginAsNewUser()
    await reserveUsage(user.id, 'anthropic', 'cv_edit')
    await reserveUsage(user.id, 'anthropic', 'resume_review')
    const rows = await testState.db.select().from(apiUsage)
    const byOperation = Object.fromEntries(rows.map((row) => [row.operation, row]))
    expect(byOperation.cv_edit).toMatchObject({
      model: 'claude-haiku-5-5',
      estimatedCostMicros: estimateCostMicros('claude-haiku-5-5', RESERVATION_TOKENS.generation),
    })
    expect(byOperation.resume_review).toMatchObject({
      model: 'claude-sonnet-5-5',
      estimatedCostMicros: estimateCostMicros('claude-sonnet-5-5', RESERVATION_TOKENS.generation),
    })
  })

  it('limits each user to 30 Claude calls per rolling 24 hours, counting every status', async () => {
    const { user } = await loginAsNewUser()
    await seedUsage(user.id, 10, { status: 'failed' })
    await seedUsage(user.id, 10, { status: 'aborted' })
    await seedUsage(user.id, 10, { status: 'reserved' })
    // Old rows are outside the window.
    await seedUsage(user.id, 5, { createdAt: new Date(Date.now() - 25 * 3600_000) })

    await expect(reserveUsage(user.id, 'anthropic', 'offer_analysis')).rejects.toMatchObject({
      statusCode: 429,
      message: 'Tu as atteint la limite de 30 générations sur 24 heures. Reviens demain !',
    })
    // Another user is unaffected.
    const other = await createUser('other@example.com')
    await expect(reserveUsage(other.id, 'anthropic', 'offer_analysis')).resolves.toEqual(
      expect.any(String),
    )
  })

  it('limits all users together per rolling 24 hours', async () => {
    testState.config.claudeGlobalDailyLimit = 5
    const a = await createUser('a@example.com')
    const b = await createUser('b@example.com')
    await seedUsage(a.id, 3)
    await seedUsage(b.id, 2)
    await expect(reserveUsage(a.id, 'anthropic', 'offer_analysis')).rejects.toMatchObject({
      statusCode: 429,
      message: 'Le quota quotidien du serveur est atteint, réessaie demain.',
    })
  })

  it('blocks with a 503 when estimated costs reach the monthly budget', async () => {
    const user = await createUser('a@example.com')
    const one = estimateCostMicros('claude-sonnet-5-5', RESERVATION_TOKENS.generation)
    // Room for exactly two reservations.
    testState.config.claudeMonthlyBudgetUsd = (one * 2) / 1_000_000
    await reserveUsage(user.id, 'anthropic', 'offer_analysis')
    await reserveUsage(user.id, 'anthropic', 'offer_analysis')
    await expect(reserveUsage(user.id, 'anthropic', 'offer_analysis')).rejects.toMatchObject({
      statusCode: 503,
      message: "Le budget mensuel de l'IA de ce serveur est atteint. Préviens l'administrateur.",
    })
  })

  it('counts the real cost of settled calls against the budget, not the estimate', async () => {
    const user = await createUser('a@example.com')
    const one = estimateCostMicros('claude-sonnet-5-5', RESERVATION_TOKENS.generation)
    testState.config.claudeMonthlyBudgetUsd = (one * 1.5) / 1_000_000
    const id = await reserveUsage(user.id, 'anthropic', 'offer_analysis')
    await settleUsage(id, {
      status: 'done',
      usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 10_000 },
    })
    const [row] = await ledger()
    // 1000 x 2 + 500 x 10 + 10 000 x 0.2 = 9000 micro-dollars.
    expect(row).toMatchObject({ status: 'done', inputTokens: 1000, estimatedCostMicros: 9000 })
    await expect(reserveUsage(user.id, 'anthropic', 'offer_analysis')).resolves.toEqual(
      expect.any(String),
    )
  })

  it('prices an unknown model like the most expensive one', () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 0 }
    expect(estimateCostMicros('claude-future-9', usage)).toBe(
      estimateCostMicros('claude-opus-5-5', usage),
    )
    expect(estimateCostMicros('claude-sonnet-5-5-20260101', usage)).toBe(2_000_000)
  })

  it('warns once per month at 80 % of the budget', async () => {
    const user = await createUser('a@example.com')
    const one = estimateCostMicros('claude-sonnet-5-5', RESERVATION_TOKENS.generation)
    testState.config.claudeMonthlyBudgetUsd = (one * 10) / 1_000_000
    for (let i = 0; i < 9; i++) await reserveUsage(user.id, 'anthropic', 'offer_analysis')
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('anthropic monthly budget'))
  })

  it('does not exceed the limit under concurrent reservations', async () => {
    const user = await createUser('a@example.com')
    testState.config.claudeGlobalDailyLimit = 8
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => reserveUsage(user.id, 'anthropic', 'offer_analysis')),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(8)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2)
    expect(await ledger()).toHaveLength(8)
  })

  it('keeps the two providers independent', async () => {
    const user = await createUser('a@example.com')
    testState.config.tavilyGlobalDailyLimit = 1
    await reserveUsage(user.id, 'tavily', 'search')
    await expect(reserveUsage(user.id, 'tavily', 'search')).rejects.toMatchObject({
      statusCode: 429,
    })
    await expect(reserveUsage(user.id, 'anthropic', 'offer_analysis')).resolves.toEqual(
      expect.any(String),
    )
  })

  it('budgets Tavily in credits', async () => {
    const user = await createUser('a@example.com')
    testState.config.tavilyMonthlyCredits = 2.5
    await reserveUsage(user.id, 'tavily', 'search')
    const id = await reserveUsage(user.id, 'tavily', 'extract')
    // Tavily reports 0.2 credit for the extract: room for one more call.
    await settleUsage(id, { status: 'done', credits: 0.2 })
    await expect(reserveUsage(user.id, 'tavily', 'search')).resolves.toEqual(expect.any(String))
    await expect(reserveUsage(user.id, 'tavily', 'search')).rejects.toMatchObject({
      statusCode: 503,
    })
  })

  it('keeps ledger rows when the account is deleted', async () => {
    const user = await createUser('a@example.com')
    await reserveUsage(user.id, 'anthropic', 'offer_analysis')
    await testState.db.delete(users)
    expect(await ledger()).toMatchObject([{ userId: null }])
  })
})

describe('streamGeneration', () => {
  it('reserves before calling Claude and settles with the real usage', async () => {
    await loginAsNewUser()
    const claude = mockClaude({ text: 'hello' })
    const events = await readSse(await generate())
    expect(events.at(-1)?.type).toBe('done')
    expect(claude.stream).toHaveBeenCalledTimes(1)

    expect(await ledger()).toMatchObject([
      {
        provider: 'anthropic',
        operation: 'offer_analysis',
        status: 'done',
        model: 'claude-sonnet-5-5',
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 900,
      },
    ])
  })

  it('stops before Claude when the quota is used up', async () => {
    const { user } = await loginAsNewUser()
    await seedUsage(user.id, 30)
    const claude = mockClaude({ text: 'x' })
    const response = await generate()
    expect(response.status).toBe(429)
    expect(claude.stream).not.toHaveBeenCalled()
  })

  it('still counts an aborted stream, at the reserved estimate', async () => {
    const { user } = await loginAsNewUser()
    testState.claude = {
      beta: {
        messages: {
          stream: () => ({
            on() {
              return this
            },
            abort() {},
            aborted: true,
            finalMessage: async () => {
              throw new Error('Request was aborted.')
            },
          }),
        },
      },
    } as unknown as typeof testState.claude

    await generate().catch(() => {})
    // Let the stream's background task settle.
    await vi.waitFor(async () => expect((await ledger())[0]?.status).toBe('aborted'))
    const [row] = await ledger()
    expect(row!.estimatedCostMicros).toBe(
      estimateCostMicros('claude-sonnet-5-5', RESERVATION_TOKENS.generation),
    )

    // The bypass is closed: looping start + abort hits the daily limit.
    await seedUsage(user.id, 29, { status: 'aborted' })
    expect((await generate()).status).toBe(429)
  })

  it('counts a failed call and keeps its estimate', async () => {
    await loginAsNewUser()
    mockClaude({ text: '', error: new Error('boom') })
    const events = await readSse(await generate())
    expect(events.at(-1)?.type).toBe('error')
    const [row] = await ledger()
    expect(row).toMatchObject({ status: 'failed' })
    expect(row!.estimatedCostMicros).toBeGreaterThan(0)
  })

  it('releases the reservation when Claude cannot even be started', async () => {
    await loginAsNewUser()
    testState.claude = {
      beta: {
        messages: {
          stream: () => {
            throw new Error('no key')
          },
        },
      },
    } as unknown as typeof testState.claude
    expect((await generate()).status).toBe(500)
    expect(await ledger()).toMatchObject([{ status: 'failed', estimatedCostMicros: 0 }])
  })

  it('counts a refused answer with its real usage', async () => {
    await loginAsNewUser()
    mockClaude({ text: '', stopReason: 'refusal' })
    const events = await readSse(await generate())
    expect(events.at(-1)?.type).toBe('error')
    expect(await ledger()).toMatchObject([{ status: 'done', outputTokens: 50 }])
  })
})

describe('Tavily usage', () => {
  it('is persisted in the ledger with the credits Tavily reports', async () => {
    const { user } = await loginAsNewUser()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ results: [], usage: { credits: 2 } })),
    )
    await callRoute(searchRoute, {
      method: 'POST',
      path: '/api/jobs/search',
      body: { query: 'développeur' },
    })
    expect(await ledger()).toMatchObject([
      { userId: user.id, provider: 'tavily', operation: 'search', status: 'done', credits: 2 },
    ])
  })

  it('falls back to the documented cost and is not lost on restart', async () => {
    await loginAsNewUser()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ results: [] })),
    )
    await callRoute(searchRoute, {
      method: 'POST',
      path: '/api/jobs/search',
      body: { query: 'développeur' },
    })
    expect(await ledger()).toMatchObject([{ credits: 1 }])
  })

  it('applies the global daily cap', async () => {
    await loginAsNewUser()
    const other = await createUser('other@example.com')
    testState.config.tavilyGlobalDailyLimit = 3
    await seedUsage(other.id, 3, { provider: 'tavily', operation: 'search' })
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const response = await callRoute(searchRoute, {
      method: 'POST',
      path: '/api/jobs/search',
      body: { query: 'développeur' },
    })
    expect(response.status).toBe(429)
    expect((await response.json()).message).toBe(
      'Le quota quotidien du serveur est atteint, réessaie demain.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/invites', () => {
  const invite = () => callRoute(createInviteRoute, { method: 'POST', path: '/api/invites' })

  it('allows 5 invitations per user per 7 days', async () => {
    await loginAsNewUser()
    for (let i = 0; i < 5; i++) expect((await invite()).status).toBe(200)
    const response = await invite()
    expect(response.status).toBe(429)
    expect((await response.json()).message).toContain('5 invitations')

    await loginAsNewUser('other@example.com')
    expect((await invite()).status).toBe(200)
  })

  it('does not exceed the cap under parallel requests', async () => {
    await loginAsNewUser()
    const responses = await Promise.all(Array.from({ length: 8 }, invite))
    expect(responses.filter((r) => r.status === 200)).toHaveLength(5)
    expect(responses.filter((r) => r.status === 429)).toHaveLength(3)
  })

  it('forgets invitations older than 7 days', async () => {
    const { user } = await loginAsNewUser()
    const old = new Date(Date.now() - 8 * 24 * 3600_000)
    await testState.db.insert(invites).values(
      Array.from({ length: 5 }, (_, i) => ({
        token: `old-${i}`,
        createdBy: user.id,
        createdAt: old,
        expiresAt: new Date(Date.now() + 3600_000),
      })),
    )
    expect((await invite()).status).toBe(200)
  })
})

describe('GET /api/usage', () => {
  it('requires a login', async () => {
    expect((await callRoute(usageRoute, { path: '/api/usage' })).status).toBe(401)
  })

  it('returns the user counts, the limits and percentages only', async () => {
    const { user } = await loginAsNewUser()
    const other = await createUser('other@example.com')
    await seedUsage(user.id, 12)
    await seedUsage(other.id, 5)
    await seedUsage(user.id, 2, { provider: 'tavily', operation: 'search', credits: 1 })
    testState.config.tavilyMonthlyCredits = 8

    const body = await (await callRoute(usageRoute, { path: '/api/usage' })).json()
    expect(body).toEqual({
      claude: { used: 12, limit: 30 },
      web: { used: 2, limit: 50 },
      monthlyPercent: { claude: 0, web: 25 },
    })
  })

  it('reports the monthly budget as a percentage', async () => {
    const { user } = await loginAsNewUser()
    testState.config.claudeMonthlyBudgetUsd = 10
    await seedUsage(user.id, 1, { estimatedCostMicros: 2_500_000 })
    const body = await (await callRoute(usageRoute, { path: '/api/usage' })).json()
    expect(body.monthlyPercent.claude).toBe(25)
    expect(JSON.stringify(body)).not.toContain('2500000')
  })
})
