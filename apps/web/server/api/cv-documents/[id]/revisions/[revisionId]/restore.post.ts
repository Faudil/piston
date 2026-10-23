import { CvRevisionParams } from '@piston/shared'

/** Restores a revision of a CV document; the current state is kept in the history first. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id, revisionId } = await getValidatedRouterParams(event, zodValidator(CvRevisionParams))
  return toCvDocument(await restoreCvRevision(user.id, id, revisionId))
})
