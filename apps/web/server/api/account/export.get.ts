/** Downloads all of the user's data as a JSON file. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const data = await buildAccountExport(user.id)
  setResponseHeaders(event, {
    'content-type': 'application/json; charset=utf-8',
    'content-disposition': attachmentHeader(`piston-export-${data.exportedAt.slice(0, 10)}.json`),
    'cache-control': 'private, no-store',
  })
  return JSON.stringify(data, null, 2)
})
