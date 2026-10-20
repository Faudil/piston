import type * as z from 'zod'

/**
 * Turns a Zod schema into a validator for h3's `readValidatedBody`,
 * `getValidatedQuery` and `getValidatedRouterParams`.
 *
 * Passing `Schema.parse` directly works, but a failure then produces a 400
 * whose message is Zod's raw JSON list of issues. This returns the first issue
 * as a readable French sentence (Zod's French locale is enabled in
 * @piston/shared) and keeps the full list in `data` for debugging.
 */
export function zodValidator<T>(schema: z.ZodType<T>) {
  return (input: unknown): T => {
    const result = schema.safeParse(input)
    if (result.success) return result.data
    const [issue] = result.error.issues
    const field = issue?.path.length ? ` (${issue.path.join('.')})` : ''
    throw createError({
      statusCode: 400,
      message: issue ? `${issue.message}${field}` : 'Requête invalide.',
      data: { issues: result.error.issues },
    })
  }
}
