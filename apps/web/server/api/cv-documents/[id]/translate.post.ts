import { IdParam } from '@piston/shared'

/**
 * « Traduire en anglais »: a copy of the document whose language is English
 * (section titles, « Present »), same template and design. The content is
 * translated afterwards by a reviewed proposal (`cv-edit` mode `translate`)
 * that the editor starts on the copy, so nothing is translated unseen.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, zodValidator(IdParam))
  const source = await getUserCvDocument(user.id, id)
  const row = await duplicateCvDocument(user.id, id, {
    title: `${source.title} (English)`.slice(0, 120),
    language: 'en',
  })
  setResponseStatus(event, 201)
  return toCvDocument(row)
})
