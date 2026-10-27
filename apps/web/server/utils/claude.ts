import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | undefined

/**
 * The single Anthropic client of the app. The API key comes from runtimeConfig,
 * which only exists on the server: it never reaches the browser.
 */
export function useClaude(): Anthropic {
  // End-to-end tests only (see fake-ai.ts); throws in production.
  if (isFakeAi()) return (client ??= fakeClaudeClient())
  if (!client) {
    const { anthropicApiKey } = useRuntimeConfig()
    if (!anthropicApiKey) {
      console.error('[claude] ANTHROPIC_API_KEY is not configured')
      throw createError({
        statusCode: 503,
        message:
          "Claude n'est pas configuré sur ce serveur (clé API manquante). Préviens l'administrateur.",
      })
    }
    client = new Anthropic({ apiKey: anthropicApiKey })
  }
  return client
}

/**
 * Tasks that run on the fast, cheaper model (Claude Haiku 5.5 by default,
 * 10-15x cheaper per call than Sonnet on these tasks, measured). They extract,
 * structure or rephrase what the user already wrote, and every edit is
 * reviewed by the user before it applies. The judgment calls (resume review,
 * offer analysis, search leads) and the cover letters, read by recruiters,
 * stay on the main model: on a thin resume Haiku proposed generic job titles
 * where Sonnet declined to invent any.
 */
export const FAST_OPERATIONS: ReadonlySet<string> = new Set([
  'import_offer', // pull the offer out of a web page
  'cv_draft', // file an existing resume or interview answers into sections
  'cv_edit', // small, reviewable edit proposals in the CV builder
])

/** The model for one operation (a generation kind or 'import_offer'). */
export function claudeModelFor(operation: string): string {
  const { claudeModel, claudeFastModel } = useRuntimeConfig()
  return FAST_OPERATIONS.has(operation) && claudeFastModel ? claudeFastModel : claudeModel
}

/**
 * Whether the server-side refusal fallback can be requested for this model:
 * Haiku models have none, and sending the parameter would fail the call.
 */
export function supportsServerFallback(model: string): boolean {
  return !model.startsWith('claude-haiku')
}

/**
 * Turns any error thrown while talking to Claude into a French message that
 * can be shown to the user, and logs the technical details (with the
 * request id, which Anthropic support asks for) on the server.
 */
export function describeClaudeError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    console.error(
      `[claude] ${error.name} status=${error.status ?? '-'} request_id=${error.requestID ?? '-'}: ${error.message}`,
    )
  } else {
    console.error('[claude] unexpected error', error)
  }

  if (error instanceof Anthropic.RateLimitError) {
    return 'Claude reçoit trop de demandes en ce moment. Réessaie dans une minute.'
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'Impossible de joindre Claude. Vérifie ta connexion et réessaie.'
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return "La clé API Claude du serveur est invalide. Préviens l'administrateur."
  }
  if (error instanceof Anthropic.InternalServerError) {
    return 'Claude rencontre un problème temporaire. Réessaie dans quelques instants.'
  }
  if (error instanceof Anthropic.APIError) {
    return "Claude n'a pas pu traiter la demande. Réessaie plus tard."
  }
  return 'Une erreur inattendue est survenue pendant la génération.'
}

/** Thrown when Claude answered but the answer cannot be used. */
export class UnusableAnswerError extends Error {}
