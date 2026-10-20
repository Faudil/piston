/** Extracts the French message sent by the API from a `$fetch` error. */
export function apiErrorMessage(error: unknown, fallback = 'Une erreur est survenue.'): string {
  const data = (error as { data?: { message?: string } } | null)?.data
  return data?.message ?? fallback
}
