import { TAVILY_CREDITS_PER_CALL, type JobSearchResult } from '@piston/shared'

const TAVILY_URL = 'https://api.tavily.com'

/**
 * Job boards the search is restricted to. Without this, a generic web search
 * mostly returns career advice articles instead of offers. French boards only,
 * since the app and its users are French.
 */
const JOB_BOARD_DOMAINS = [
  'welcometothejungle.com',
  'indeed.fr',
  'fr.indeed.com',
  'hellowork.com',
  'apec.fr',
  'francetravail.fr',
  'linkedin.com',
  'jobteaser.com',
  'cadremploi.fr',
  'meteojob.com',
]

const SNIPPET_LENGTH = 300

interface TavilySearchResponse {
  usage?: { credits?: number }
  results?: Array<{ title: string; url: string; content: string; published_date?: string }>
}

interface TavilyExtractResponse {
  usage?: { credits?: number }
  results?: Array<{ url: string; raw_content: string }>
  failed_results?: Array<{ url: string; error: string }>
}

/** True when a Tavily API key is configured: job search and offer import are available. */
export function isWebSearchEnabled(): boolean {
  return Boolean(useRuntimeConfig().tavilyApiKey)
}

/**
 * The only function that talks to Tavily. Reserves the call in the usage
 * ledger first (which enforces the per-user and global limits), then returns
 * the parsed JSON, or throws an h3 error with a French message the user can
 * read. The ledger gets the credits Tavily reports (`usage.credits`), or the
 * documented cost of one call when the response has none.
 */
async function tavilyRequest<T extends { usage?: { credits?: number } }>(
  userId: string,
  path: '/search' | '/extract',
  body: object,
): Promise<T> {
  const { tavilyApiKey } = useRuntimeConfig()
  if (!tavilyApiKey) {
    throw createError({
      statusCode: 503,
      message: "La recherche web n'est pas configurée sur ce serveur.",
    })
  }

  const usageId = await reserveUsage(userId, 'tavily', path.slice(1))

  let response: Response
  try {
    response = await fetch(`${TAVILY_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tavilyApiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    // No answer: the request may still have been processed, keep the estimate.
    await settleUsage(usageId, { status: 'failed' })
    console.error(`[tavily] ${path} request failed`, error)
    throw createError({
      statusCode: 502,
      message: 'La recherche web ne répond pas. Réessaie dans un instant.',
    })
  }

  const payload = (await response.json().catch(() => ({}))) as T & { request_id?: string }
  console.info(`[tavily] ${path} status=${response.status} request_id=${payload.request_id ?? '-'}`)
  if (response.ok) {
    await settleUsage(usageId, {
      status: 'done',
      credits: payload.usage?.credits ?? TAVILY_CREDITS_PER_CALL,
    })
    return payload
  }
  // Rejected requests (bad key, quota) are not billed by Tavily, but they still
  // count as a call; the estimated credit is kept, which is the safe side.
  await settleUsage(usageId, { status: 'failed' })

  if (response.status === 401) {
    console.error('[tavily] invalid TAVILY_API_KEY')
    throw createError({
      statusCode: 503,
      message: "La recherche web n'est pas configurée sur ce serveur.",
    })
  }
  if (response.status === 429) {
    throw createError({
      statusCode: 429,
      message: 'Trop de recherches en ce moment, réessaie dans une minute.',
    })
  }
  if (response.status === 432 || response.status === 433) {
    throw createError({
      statusCode: 503,
      message: 'Le quota de recherche du serveur est épuisé.',
    })
  }
  throw createError({
    statusCode: 502,
    message: 'La recherche web a échoué. Réessaie plus tard.',
  })
}

/** Searches the French job boards. Costs one Tavily credit (basic depth). */
export async function searchJobs(
  userId: string,
  query: string,
  location?: string,
): Promise<JobSearchResult[]> {
  const data = await tavilyRequest<TavilySearchResponse>(userId, '/search', {
    query: [query, "offre d'emploi", location].filter(Boolean).join(' '),
    search_depth: 'basic',
    max_results: 10,
    topic: 'general',
    include_domains: JOB_BOARD_DOMAINS,
    time_range: 'month',
    include_published_date: true,
    country: 'france',
  })

  return (data.results ?? []).map((result) => ({
    title: result.title,
    url: result.url,
    snippet: result.content.trim().slice(0, SNIPPET_LENGTH),
    source: new URL(result.url).hostname,
    publishedDate: result.published_date ?? null,
  }))
}

/** Fetches a page as markdown, or throws a French error when Tavily could not read it. */
export async function extractPage(userId: string, url: string): Promise<string> {
  const data = await tavilyRequest<TavilyExtractResponse>(userId, '/extract', {
    urls: url,
    extract_depth: 'basic',
    format: 'markdown',
  })

  const page = data.results?.[0]
  if (!page?.raw_content?.trim()) {
    const reason = data.failed_results?.[0]?.error
    if (reason) console.error(`[tavily] extract failed for ${url}: ${reason}`)
    throw createError({
      statusCode: 422,
      message: "Impossible de lire cette page. Copie le texte de l'offre à la main.",
    })
  }
  return page.raw_content
}
