import type { H3Event } from 'h3'
import type { ZodType } from 'zod'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { generations } from '@piston/db'
import type {
  Generation,
  GenerationEvent,
  GenerationInputRefs,
  GenerationKind,
  GenerationOutputs,
} from '@piston/shared'

/** Everything needed to run one Claude generation and store its result. */
export interface GenerationSpec<K extends GenerationKind> {
  kind: K
  userId: string
  /** System prompt from @piston/prompts. Identical across calls, so it is cached. */
  system: string
  /**
   * The document the request is about, wrapped in its tags: the resume in
   * <cv>, or for the CV builder the CV document or the interview answers.
   * Identical across calls of a user, so it is cached.
   */
  resume: string
  /** The variable part of the request: offer, options, instruction. */
  request: string
  inputRefs: GenerationInputRefs
  /**
   * How to turn Claude's answer into the stored output:
   * - `schema`: structured output, JSON constrained by the API and validated
   *   as a whole by the SDK;
   * - `format` + `fromJson`: structured output whose JSON is validated by
   *   `fromJson` instead, which may keep the valid parts of an answer (CV
   *   edit proposals drop an invalid operation rather than the proposal) and
   *   returns null when the answer is unusable;
   * - `fromText`: free text, post-processed.
   */
  output:
    | { schema: ZodType<GenerationOutputs[K]> }
    | { format: ZodType; fromJson: (value: unknown) => GenerationOutputs[K] | null }
    | { fromText: (text: string) => GenerationOutputs[K] }
}

/**
 * Runs a generation and streams it to the browser as Server-Sent Events:
 * `delta` events while Claude writes, then a single `done` event with the
 * saved generation, or an `error` event with a French message.
 *
 * Usage in a route: `return streamGeneration(event, spec)`.
 */
export function streamGeneration<K extends GenerationKind>(
  event: H3Event,
  spec: GenerationSpec<K>,
) {
  const eventStream = createEventStream(event)
  const send = (payload: GenerationEvent) =>
    eventStream.push({ event: payload.type, data: JSON.stringify(payload) })

  const { claudeModel } = useRuntimeConfig(event)
  const { output: outputSpec } = spec
  // The lenient mode sends the schema as plain JSON Schema, so the SDK does
  // not reject the whole answer when one part of it fails validation.
  const format =
    'schema' in outputSpec
      ? betaZodOutputFormat(outputSpec.schema)
      : 'format' in outputSpec
        ? { type: 'json_schema' as const, schema: betaZodOutputFormat(outputSpec.format).schema }
        : undefined

  const claudeStream = useClaude().beta.messages.stream({
    model: claudeModel,
    max_tokens: 16000,
    // If the model declines for policy reasons, the API retries on its default
    // fallback model inside the same call instead of failing.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'medium',
      ...(format && { format }),
    },
    // Cache breakpoints: the system prompt, then the resume. Only `request`
    // changes between two calls of the same user.
    system: [{ type: 'text', text: spec.system, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: spec.resume, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: spec.request },
        ],
      },
    ],
  })

  // Stop paying for tokens nobody will read if the user leaves the page.
  eventStream.onClosed(() => claudeStream.abort())

  claudeStream.on('text', (text) => {
    void send({ type: 'delta', text })
  })

  const run = async () => {
    try {
      const message = await claudeStream.finalMessage()

      if (message.stop_reason === 'refusal') {
        throw new UnusableAnswerError(
          'Claude a refusé de traiter cette demande. Reformule le texte et réessaie.',
        )
      }
      if (message.stop_reason === 'max_tokens') {
        throw new UnusableAnswerError(
          'La réponse de Claude a été coupée car trop longue. Réessaie.',
        )
      }

      const text = message.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('')
      let output: GenerationOutputs[K] | null
      if ('schema' in outputSpec) {
        output = (message.parsed_output as GenerationOutputs[K] | null) ?? null
      } else if ('fromJson' in outputSpec) {
        let value: unknown = null
        try {
          value = JSON.parse(text)
        } catch {
          // Not JSON at all: reported below as an unusable answer.
        }
        output = outputSpec.fromJson(value)
      } else {
        output = outputSpec.fromText(text)
      }
      if (!output) {
        throw new UnusableAnswerError("La réponse de Claude n'a pas le format attendu. Réessaie.")
      }

      const { usage } = message
      const [row] = await useDb()
        .insert(generations)
        .values({
          userId: spec.userId,
          kind: spec.kind,
          inputRefs: spec.inputRefs,
          output,
          // The model that actually answered, which differs if a fallback ran.
          model: message.model,
          // Cached tokens are billed differently but still count as input.
          inputTokens:
            usage.input_tokens +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0),
          outputTokens: usage.output_tokens,
        })
        .returning()

      await send({ type: 'done', generation: toGeneration(row!) as Generation<GenerationKind> })
    } catch (error) {
      if (claudeStream.aborted) return
      const message =
        error instanceof UnusableAnswerError ? error.message : describeClaudeError(error)
      await send({ type: 'error', message })
    } finally {
      await eventStream.close()
    }
  }
  void run()

  return eventStream.send()
}
