import * as z from 'zod'

/** External paid APIs tracked in the usage ledger (`api_usage.provider`). */
export const apiProviders = ['anthropic', 'tavily'] as const
export type ApiProvider = (typeof apiProviders)[number]

/**
 * Life cycle of a ledger row. A call is `reserved` before it starts (and keeps
 * its conservative estimate if it never settles), then becomes `done`,
 * `failed` or `aborted` (the client left mid-stream).
 */
export const usageStatuses = ['reserved', 'done', 'failed', 'aborted'] as const
export type UsageStatus = (typeof usageStatuses)[number]

/** USD per million tokens. */
export interface ModelPrice {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/**
 * Public Anthropic prices, USD per million tokens. Update when prices change;
 * this only feeds the server's own budget guard, never a customer invoice.
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
}

/**
 * The most expensive known price. Used for models missing from the table
 * (a new model, a fallback model, a typo in CLAUDE_MODEL): over-estimating
 * is the safe direction for a spending cap.
 */
export const MOST_EXPENSIVE_PRICE: ModelPrice = Object.values(MODEL_PRICES).reduce((max, price) =>
  price.output > max.output ? price : max,
)

/** Price of a model, matching dated ids too (`claude-sonnet-5-5-20260101`). */
export function priceOf(model: string | null | undefined): ModelPrice {
  if (!model) return MOST_EXPENSIVE_PRICE
  const key = Object.keys(MODEL_PRICES).find(
    (name) => model === name || model.startsWith(`${name}-`),
  )
  return key ? MODEL_PRICES[key]! : MOST_EXPENSIVE_PRICE
}

/** Token counts of one Claude call, as in the Anthropic `usage` object. */
export const ClaudeUsage = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number().nullish(),
  cache_read_input_tokens: z.number().nullish(),
})
export type ClaudeUsage = z.infer<typeof ClaudeUsage>

/**
 * Cost of a Claude call in micro-dollars (USD x 1e6), rounded up. Since
 * prices are USD per million tokens, tokens x price is already in micros.
 */
export function estimateCostMicros(model: string | null | undefined, usage: ClaudeUsage): number {
  const price = priceOf(model)
  return Math.ceil(
    usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite,
  )
}

/**
 * Tokens assumed for a call that has not finished (or never reported its
 * usage). Deliberately high: a generation sends a resume + offer + prompt
 * (about 30k tokens at worst) and may write up to 16k; 8k output is a typical
 * long answer. Offer import sends at most 60 000 characters of page text.
 */
export const RESERVATION_TOKENS = {
  generation: { input_tokens: 30_000, output_tokens: 8_000 },
  import_offer: { input_tokens: 20_000, output_tokens: 4_000 },
} as const satisfies Record<string, ClaudeUsage>

/**
 * Tavily credits assumed per call when budgeting. A basic search costs 1
 * credit; a basic extract costs 0.2 credit per URL (1 credit per 5 URLs),
 * rounded up to 1 here because we never extract several URLs at once and an
 * over-estimate is the safe direction. The response's `usage.credits`
 * replaces it when Tavily reports it.
 */
export const TAVILY_CREDITS_PER_CALL = 1

/** `GET /api/usage`: the user's own 24 h counts and limits, plus the server's monthly budget as percentages. */
export interface UsageSummary {
  claude: { used: number; limit: number }
  web: { used: number; limit: number }
  /** Share of this month's server budget used, 0 to 100. No amounts are exposed. */
  monthlyPercent: { claude: number; web: number }
}
