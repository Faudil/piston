import * as z from 'zod'
import { LIMITS } from '@piston/shared'

const MAX_TITLE_LENGTH = 120

/**
 * Creates a resume version from an uploaded PDF (multipart field `file`, plus
 * an optional `title` and an optional `profileId`, the default profile otherwise). The extracted text is stored for the AI features, and the original PDF
 * (max 5 MB, checked above) is kept so it can be downloaded again.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  // Reject big uploads before reading them, when the client announces the size.
  const declaredLength = Number(getRequestHeader(event, 'content-length') ?? 0)
  if (declaredLength > LIMITS.maxPdfBytes + 64 * 1024) throw tooLarge()

  const parts = (await readMultipartFormData(event)) ?? []
  const file = parts.find((part) => part.name === 'file' && part.filename)
  if (!file) throw createError({ statusCode: 400, message: 'Choisis un fichier PDF.' })
  if (file.data.length > LIMITS.maxPdfBytes) throw tooLarge()
  if (!looksLikePdf(file.data)) {
    throw createError({ statusCode: 400, message: "Ce fichier n'est pas un PDF." })
  }

  const profilePart = parts
    .find((part) => part.name === 'profileId')
    ?.data.toString('utf8')
    .trim()
  const profileId = profilePart ? zodValidator(z.uuid())(profilePart) : undefined

  const text = await extractPdfText(file.data)
  if (!text) {
    throw createError({
      statusCode: 400,
      message:
        'Aucun texte trouvé dans ce PDF : il semble être une image (CV scanné). Colle plutôt le texte de ton CV.',
    })
  }
  if (text.length > LIMITS.maxTextLength) {
    throw createError({
      statusCode: 400,
      message: `Le texte de ce PDF dépasse ${LIMITS.maxTextLength} caractères. Colle une version plus courte.`,
    })
  }

  const sourceFilename = file.filename!
  const titlePart = parts
    .find((part) => part.name === 'title')
    ?.data.toString('utf8')
    .trim()
  const title = (titlePart || sourceFilename.replace(/\.pdf$/i, '')).slice(0, MAX_TITLE_LENGTH)

  const row = await createCurrentResume(user.id, {
    title,
    rawText: text,
    profileId,
    sourceFilename,
    sourcePdf: file.data,
  })
  setResponseStatus(event, 201)
  return toResume(row)
})

function tooLarge() {
  return createError({ statusCode: 413, message: 'Le PDF ne doit pas dépasser 5 Mo.' })
}
