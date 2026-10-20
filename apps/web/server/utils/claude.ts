import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | undefined

/**
 * The single Anthropic client of the app. The API key comes from runtimeConfig,
 * which only exists on the server: it never reaches the browser.
 */
export function useClaude(): Anthropic {
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
