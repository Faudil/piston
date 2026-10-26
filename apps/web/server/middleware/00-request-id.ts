/**
 * Gives every request an id, returned in the `X-Request-Id` response header
 * and written in the error logs: a user reporting a problem can quote it.
 * An id sent by the client is never trusted (it could forge log lines).
 */
export default defineEventHandler((event) => {
  const id = crypto.randomUUID()
  event.context.requestId = id
  setResponseHeader(event, 'x-request-id', id)
})
