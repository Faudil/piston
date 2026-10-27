import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { importOfferPrompt, wrapPage } from '@piston/prompts'
import { ImportedOfferOutput, LIMITS, type ImportedOffer } from '@piston/shared'

/** Most page text sent to Claude. Job pages are mostly navigation noise; this is plenty. */
const MAX_PAGE_CHARS = 60_000

/**
 * Only public http(s) URLs. Tavily fetches the page, not this server, so this
 * is not a full SSRF defence; it is hygiene so the endpoint is never a way to
 * probe internal addresses if the fetching ever moves in-house.
 */
export function parsePublicUrl(input: string): URL {
  const invalid = () =>
    createError({ statusCode: 400, message: "Cette adresse n'est pas un lien public valide." })

  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw invalid()
  }
  // `new URL` normalizes decimal/hex IPv4 forms to dotted quads, checked below.
  const host = url.hostname
  const isPrivateIpv4 =
    /^(0|10|127)\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    !host.includes('.') || // also rejects "localhost" and bare IPv6 hosts (bracketed, no dot)
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    isPrivateIpv4
  ) {
    throw invalid()
  }
  return url
}

/**
 * Fetches a job ad through Tavily, then asks Claude to keep only the ad itself.
 * The result is not saved: the user reviews it in the new-offer form.
 *
 * Counts as one Tavily call (the extract) and one Claude call (the cleanup),
 * both in the usage ledger. Nothing is stored in `generations`.
 */
export async function importOffer(userId: string, url: URL): Promise<ImportedOffer> {
  // Reserve the Claude call first: if the user or the server is out of quota,
  // do not spend a Tavily credit on a page that could not be cleaned up.
  const usageId = await reserveUsage(userId, 'anthropic', 'import_offer')

  let page: string
  try {
    page = (await extractPage(userId, url.href)).slice(0, MAX_PAGE_CHARS)
  } catch (error) {
    await settleUsage(usageId, { status: 'failed', usage: NO_USAGE }) // Claude was never called
    throw error
  }
  let output: ImportedOfferOutput | null
  try {
    const message = await useClaude().messages.parse({
      model: claudeModelFor('import_offer'),
      max_tokens: 8000,
      output_config: { effort: 'low', format: zodOutputFormat(ImportedOfferOutput) },
      system: importOfferPrompt(),
      messages: [{ role: 'user', content: wrapPage(page) }],
    })
    await settleUsage(usageId, { status: 'done', usage: message.usage, model: message.model })
    output = message.parsed_output
  } catch (error) {
    // Unknown cost (the request may have been billed): keep the estimate.
    await settleUsage(usageId, { status: 'failed' })
    throw createError({ statusCode: 502, message: describeClaudeError(error) })
  }

  if (!output) {
    throw createError({
      statusCode: 502,
      message: "La réponse de Claude n'a pas le format attendu. Réessaie.",
    })
  }
  if (!output.isJobOffer) {
    throw createError({
      statusCode: 422,
      message: "Cette page ne ressemble pas à une offre d'emploi.",
    })
  }
  return {
    title: output.title.trim(),
    company: output.company.trim(),
    rawText: output.text.trim().slice(0, LIMITS.maxTextLength),
    url: url.href,
  }
}
