/**
 * The invitation page validates its link while rendering. Count that page
 * request too, so the page cannot be used to test tokens around the API limit.
 */
export default defineEventHandler(async (event) => {
  if (getRequestURL(event).pathname.startsWith('/invite/')) await throttleInviteCheck(event)
})
