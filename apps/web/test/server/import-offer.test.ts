import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import importRoute from '../../server/api/offers/import-url.post'
import { testState } from './state'
import { callRoute, loginAsNewUser, mockClaude, resetTestState } from './helpers'

let fetchMock: ReturnType<typeof vi.spyOn>

const extracted = (raw_content = '# Dev Vue\nBeaucoup de bruit') =>
  new Response(JSON.stringify({ results: [{ url: 'https://example.com/job', raw_content }] }))

const importUrl = (url = 'https://example.com/job') =>
  callRoute(importRoute, { method: 'POST', path: '/api/offers/import-url', body: { url } })

const offerOutput = {
  isJobOffer: true,
  title: ' Développeur Vue ',
  company: 'Acme',
  text: 'Missions : tout.',
}

beforeEach(async () => {
  await resetTestState()

  fetchMock = vi.spyOn(globalThis, 'fetch')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/offers/import-url', () => {
  it('requires a login', async () => {
    expect((await importUrl()).status).toBe(401)
  })

  it('answers 503 without a key', async () => {
    await loginAsNewUser()
    testState.config.tavilyApiKey = ''
    expect((await importUrl()).status).toBe(503)
  })

  it.each([
    'ftp://example.com/job',
    'http://localhost/job',
    'http://intranet/job',
    'http://127.0.0.1/job',
    'http://2130706433/job',
    'http://10.0.0.5/job',
    'http://192.168.1.1/job',
    'http://172.20.0.1/job',
    'http://169.254.169.254/latest',
    'http://[::1]/job',
    'http://app.localhost/job',
    'https://user:pass@example.com/job',
  ])('rejects %s without calling Tavily', async (url) => {
    await loginAsNewUser()
    const response = await importUrl(url)
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('extracts the page, cleans it with Claude and returns an unsaved offer', async () => {
    await loginAsNewUser()
    fetchMock.mockResolvedValue(extracted('x'.repeat(70_000)))
    const claude = mockClaude({ text: '{}', parsed: offerOutput })

    const response = await importUrl()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      title: 'Développeur Vue',
      company: 'Acme',
      rawText: 'Missions : tout.',
      url: 'https://example.com/job',
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.tavily.com/extract')
    expect(init.headers.authorization).toBe('Bearer test-tavily-key')
    expect(JSON.parse(init.body)).toMatchObject({
      urls: 'https://example.com/job',
      format: 'markdown',
    })

    const [params] = claude.parseCalls as Array<{
      model: string
      output_config: { effort: string }
      messages: Array<{ content: string }>
    }>
    expect(params.model).toBe('claude-sonnet-5-5')
    expect(params.output_config.effort).toBe('low')
    // The page is wrapped and capped at 60 000 characters.
    const sent = params.messages[0]!.content
    expect(sent.startsWith('<page>')).toBe(true)
    expect(sent.length).toBeLessThan(60_100)
  })

  it('trims the cleaned text to the maximum length', async () => {
    await loginAsNewUser()
    fetchMock.mockResolvedValue(extracted())
    mockClaude({ text: '{}', parsed: { ...offerOutput, text: 'y'.repeat(30_000) } })
    const body = await (await importUrl()).json()
    expect(body.rawText).toHaveLength(20_000)
  })

  it('answers 422 when the page is not a job offer', async () => {
    await loginAsNewUser()
    fetchMock.mockResolvedValue(extracted())
    mockClaude({ text: '{}', parsed: { isJobOffer: false, title: '', company: '', text: '' } })
    const response = await importUrl()
    expect(response.status).toBe(422)
    expect((await response.json()).message).toBe(
      "Cette page ne ressemble pas à une offre d'emploi.",
    )
  })

  it('answers 422 when Tavily could not read the page', async () => {
    await loginAsNewUser()
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [],
          failed_results: [{ url: 'https://example.com/job', error: 'blocked' }],
        }),
      ),
    )
    const claude = mockClaude({ text: '{}', parsed: offerOutput })
    const response = await importUrl()
    expect(response.status).toBe(422)
    expect(claude.parse).not.toHaveBeenCalled()
  })

  it('maps a Tavily rate limit', async () => {
    await loginAsNewUser()
    fetchMock.mockResolvedValue(new Response('{}', { status: 429 }))
    expect((await importUrl()).status).toBe(429)
  })

  it('maps a Claude failure to a French 502', async () => {
    await loginAsNewUser()
    fetchMock.mockResolvedValue(extracted())
    mockClaude({ text: '', error: new Error('boom') })
    const response = await importUrl()
    expect(response.status).toBe(502)
    expect((await response.json()).message).toBe(
      'Une erreur inattendue est survenue pendant la génération.',
    )
  })

  it('does not store a generation and counts as a Claude call and a Tavily call', async () => {
    const { user } = await loginAsNewUser()
    fetchMock.mockImplementation(async () => extracted())
    mockClaude({ text: '{}', parsed: offerOutput })
    // The Claude cleanup shares the per-user quota of 30 calls with generations.
    for (let i = 0; i < 30; i++) expect((await importUrl()).status).toBe(200)
    const blocked = await importUrl()
    expect(blocked.status).toBe(429)
    expect((await blocked.json()).message).toContain('30 générations')
    // The blocked import did not spend a Tavily credit.
    expect(fetchMock).toHaveBeenCalledTimes(30)
    expect(await testState.db.query.generations.findMany()).toHaveLength(0)

    const rows = await testState.db.query.apiUsage.findMany()
    expect(
      rows.filter((r) => r.provider === 'anthropic' && r.operation === 'import_offer'),
    ).toHaveLength(30)
    expect(rows.filter((r) => r.provider === 'tavily' && r.operation === 'extract')).toHaveLength(
      30,
    )
    expect(rows.every((r) => r.userId === user.id && r.status === 'done')).toBe(true)
  })
})
