import {
  createApp,
  createRouter,
  send,
  setResponseStatus,
  toWebHandler,
  type EventHandler,
  type H3Error,
} from 'h3'
import { vi } from 'vitest'
import { resumeProfiles, resumes, users } from '@piston/db'
import { createTestDb, truncateAll } from '@piston/db/testing'
import { sampleResume } from '@piston/db/fixtures'
import type { GenerationEvent } from '@piston/shared'
import authMiddleware from '../../server/middleware/auth'
import rateLimitMiddleware from '../../server/middleware/rate-limit'
import { resetWebCalls } from '../../server/utils/web-limit'
import { testState } from './state'

/**
 * Empty database, no logged-in user, default config. Call in `beforeEach`.
 * The in-memory database is created once per test file, then emptied.
 */
export async function resetTestState() {
  if (testState.db) await truncateAll(testState.db)
  else testState.db = await createTestDb()
  testState.user = null
  testState.config.dailyGenerationLimit = 30
  testState.config.tavilyApiKey = 'test-tavily-key'
  resetWebCalls()
  testState.claude = createClaudeMock({ text: '{}' }).client
}

/** Creates a user with a default « Principal » profile holding a current resume, and logs them in. */
export async function loginAsNewUser(email = 'user@example.com') {
  const [user] = await testState.db
    .insert(users)
    .values({ email, displayName: 'Camille', passwordHash: 'hashed:password123' })
    .returning()
  const [profile] = await testState.db
    .insert(resumeProfiles)
    .values({ userId: user!.id, name: 'Principal', isDefault: true })
    .returning()
  const [resume] = await testState.db
    .insert(resumes)
    .values({
      userId: user!.id,
      profileId: profile!.id,
      title: 'CV',
      rawText: sampleResume,
      isCurrent: true,
    })
    .returning()
  testState.user = { id: user!.id, email: user!.email, displayName: user!.displayName }
  return { user: user!, profile: profile!, resume: resume! }
}

/**
 * Calls a route handler through a real h3 app, with the same server
 * middleware as production, and returns the Web `Response`.
 */
export async function callRoute(
  handler: EventHandler,
  options: {
    method?: string
    path?: string
    route?: string
    body?: unknown
    headers?: Record<string, string>
  } = {},
) {
  const method = options.method ?? 'GET'
  const path = options.path ?? '/api/test'
  // Same error body shape as Nitro's error handler, which includes `message`
  // (plain h3 leaves it out).
  const app = createApp({
    onError(error: H3Error, event) {
      setResponseStatus(event, error.statusCode)
      return send(
        event,
        JSON.stringify({ statusCode: error.statusCode, message: error.message }),
        'application/json',
      )
    },
  })
  app.use(authMiddleware)
  app.use(rateLimitMiddleware)
  const router = createRouter()
  router.use(options.route ?? path.split('?')[0]!, handler, method.toLowerCase() as 'get')
  app.use(router)

  const isForm = options.body instanceof FormData
  return toWebHandler(app)(
    new Request(`http://localhost${path}`, {
      method,
      headers: isForm
        ? options.headers
        : { 'content-type': 'application/json', ...options.headers },
      body:
        options.body === undefined
          ? undefined
          : isForm
            ? (options.body as FormData)
            : JSON.stringify(options.body),
    }),
  )
}

/** Reads a Server-Sent Events response into the list of events it carried. */
export async function readSse(response: Response): Promise<GenerationEvent[]> {
  const text = await response.text()
  return text
    .split('\n\n')
    .map((chunk) => chunk.split('\n').find((line) => line.startsWith('data: ')))
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice('data: '.length)) as GenerationEvent)
}

/**
 * A fake Anthropic client whose `beta.messages.stream()` emits `text` in a
 * few chunks, then resolves `finalMessage()`. `parsed` is what the SDK would
 * have parsed from structured output. Every call's params are recorded.
 */
export function createClaudeMock(answer: {
  text: string
  parsed?: unknown
  stopReason?: string
  error?: Error
}) {
  const calls: Array<Record<string, unknown>> = []
  const stream = vi.fn((params: Record<string, unknown>) => {
    calls.push(params)
    const listeners: Array<(text: string) => void> = []
    let aborted = false
    return {
      on(event: string, listener: (text: string) => void) {
        if (event === 'text') listeners.push(listener)
        return this
      },
      abort() {
        aborted = true
      },
      get aborted() {
        return aborted
      },
      async finalMessage() {
        await Promise.resolve()
        if (answer.error) throw answer.error
        for (const chunk of answer.text.match(/[\s\S]{1,20}/g) ?? [])
          listeners.forEach((l) => l(chunk))
        return {
          model: params.model,
          stop_reason: answer.stopReason ?? 'end_turn',
          content: [{ type: 'text', text: answer.text }],
          parsed_output: answer.parsed ?? null,
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 900,
          },
        }
      },
    }
  })
  // Non-streaming structured call: `messages.parse()` returns the parsed output directly.
  const parseCalls: Array<Record<string, unknown>> = []
  const parse = vi.fn(async (params: Record<string, unknown>) => {
    parseCalls.push(params)
    if (answer.error) throw answer.error
    return {
      model: params.model,
      stop_reason: answer.stopReason ?? 'end_turn',
      content: [{ type: 'text', text: answer.text }],
      parsed_output: answer.parsed ?? null,
    }
  })
  const client = {
    beta: { messages: { stream } },
    messages: { parse },
  } as unknown as typeof testState.claude
  return { client, calls, stream, parseCalls, parse }
}

/** Installs a Claude mock for the next calls and returns its recorder. */
export function mockClaude(answer: Parameters<typeof createClaudeMock>[0]) {
  const mock = createClaudeMock(answer)
  testState.claude = mock.client
  return mock
}
