/** Logs every unexpected server error (5xx) as one JSON line, see utils/logger.ts. */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', async (error, context) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500
    if (status < 500 || !context.event) return
    await logServerError(context.event, error)
  })
})
