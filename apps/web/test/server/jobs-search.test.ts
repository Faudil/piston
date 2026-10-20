import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import featuresRoute from '../../server/api/features.get'
import searchRoute from '../../server/api/jobs/search.post'
import { testState } from './state'
import { callRoute, loginAsNewUser, resetTestState } from './helpers'

let fetchMock: ReturnType<typeof vi.spyOn>

/** A Tavily-like JSON response. */
function tavilyResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

const search = (body: unknown = { query: 'développeur vue', location: 'Lyon' }) =>
  callRoute(searchRoute, { method: 'POST', path: '/api/jobs/search', body })

beforeEach(async () => {
  await resetTestState()

  fetchMock = vi.spyOn(globalThis, 'fetch')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/features', () => {
  it('requires a login', async () => {
    const response = await callRoute(featuresRoute, { path: '/api/features' })
    expect(response.status).toBe(401)
  })

  it('reports whether a Tavily key is configured', async () => {
    await loginAsNewUser()
    const on = await callRoute(featuresRoute, { path: '/api/features' })
    expect(await on.json()).toEqual({ webSearch: true })

    testState.config.tavilyApiKey = ''
    const off = await callRoute(featuresRoute, { path: '/api/features' })
    expect(await off.json()).toEqual({ webSearch: false })
  })
})

describe('POST /api/jobs/search', () => {
  it('requires a login', async () => {
    expect((await search()).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('validates the body', async () => {
    await loginAsNewUser()
    expect((await search({ query: 'a' })).status).toBe(400)
  })

  it('answers 503 without a key', async () => {
    await loginAsNewUser()
    testState.config.tavilyApiKey = ''
    const response = await search()
    expect(response.status).toBe(503)
    expect((await response.json()).message).toBe(
      "La recherche web n'est pas configurée sur ce serveur.",
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('queries Tavily on the job boards and maps the results', async () => {
    await loginAsNewUser()
    fetchMock.mockResolvedValue(
      tavilyResponse({
        request_id: 'req-1',
        results: [
          {
            title: 'Dev Vue H/F',
            url: 'https://www.welcometothejungle.com/fr/jobs/1',
            content: `  ${'x'.repeat(500)}`,
            score: 0.9,
            published_date: '2026-10-01',
          },
          {
            title: 'Autre',
            url: 'https://fr.indeed.com/viewjob?jk=2',
            content: 'court',
            score: 0.5,
          },
        ],
      }),
    )

    const response = await search()
    expect(response.status).toBe(200)
    const { results } = await response.json()
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      title: 'Dev Vue H/F',
      source: 'www.welcometothejungle.com',
      publishedDate: '2026-10-01',
    })
    expect(results[0].snippet).toHaveLength(300)
    expect(results[1]).toMatchObject({ snippet: 'court', publishedDate: null })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.tavily.com/search')
    expect(init.headers.authorization).toBe('Bearer test-tavily-key')
    const sent = JSON.parse(init.body)
    expect(sent).toMatchObject({
      query: "développeur vue offre d'emploi Lyon",
      search_depth: 'basic',
      max_results: 10,
    })
    expect(sent.include_domains).toContain('welcometothejungle.com')
  })

  it('omits the location from the query when there is none', async () => {
    await loginAsNewUser()
    fetchMock.mockResolvedValue(tavilyResponse({ results: [] }))
    await search({ query: 'comptable', location: '' })
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).query).toBe("comptable offre d'emploi")
  })

  it.each([
    [401, 503, "La recherche web n'est pas configurée sur ce serveur."],
    [429, 429, 'Trop de recherches en ce moment, réessaie dans une minute.'],
    [432, 503, 'Le quota de recherche du serveur est épuisé.'],
    [433, 503, 'Le quota de recherche du serveur est épuisé.'],
    [500, 502, 'La recherche web a échoué. Réessaie plus tard.'],
  ])('maps a Tavily %i to %i', async (tavilyStatus, status, message) => {
    await loginAsNewUser()
    fetchMock.mockResolvedValue(tavilyResponse({ detail: 'nope' }, tavilyStatus))
    const response = await search()
    expect(response.status).toBe(status)
    expect((await response.json()).message).toBe(message)
  })

  it('answers 502 when Tavily is unreachable', async () => {
    await loginAsNewUser()
    fetchMock.mockRejectedValue(new Error('timeout'))
    expect((await search()).status).toBe(502)
  })

  it('limits each user to 50 Tavily calls per 24 hours', async () => {
    await loginAsNewUser()
    fetchMock.mockImplementation(async () => tavilyResponse({ results: [] }))
    for (let i = 0; i < 50; i++) expect((await search()).status).toBe(200)

    const response = await search()
    expect(response.status).toBe(429)
    expect((await response.json()).message).toContain('50 recherches web')
    expect(fetchMock).toHaveBeenCalledTimes(50)

    // Another user has their own quota.
    await loginAsNewUser('other@example.com')
    expect((await search()).status).toBe(200)
  })
})
