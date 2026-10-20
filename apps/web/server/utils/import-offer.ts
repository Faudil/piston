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
 * This call counts toward the Tavily limit, not toward the daily generations
 * (nothing is stored in `generations`).
 */
export async function importOffer(url: URL): Promise<ImportedOffer> {
  const page = (await extractPage(url.href)).slice(0, MAX_PAGE_CHARS)
  const { claudeModel } = useRuntimeConfig()

  let output: ImportedOfferOutput | null
  try {
    const message = await useClaude().messages.parse({
      model: claudeModel,
      max_tokens: 8000,
      output_config: { effort: 'low', format: zodOutputFormat(ImportedOfferOutput) },
      system: importOfferPrompt(),
      messages: [{ role: 'user', content: wrapPage(page) }],
    })
    output = message.parsed_output
  } catch (error) {
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
