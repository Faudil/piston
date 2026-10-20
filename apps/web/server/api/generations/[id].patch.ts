import { eq, generations } from '@piston/db'
import { IdParam, UpdateGenerationBody } from '@piston/shared'

/** Saves the user's edits of a cover letter (the only editable generation). */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const body = await readValidatedBody(event, zodValidator(UpdateGenerationBody))
  await getUserCoverLetter(user.id, id)

  const paragraphs = body.paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean)
  if (paragraphs.length === 0) {
    throw createError({ statusCode: 400, message: 'La lettre ne peut pas être vide.' })
  }

  const [row] = await useDb()
    .update(generations)
    .set({ output: { paragraphs } })
    .where(eq(generations.id, id))
    .returning()
  return toGeneration(row!)
})
