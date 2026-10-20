/** "dd/mm/yyyy HH:mm" in French locale, for status history and card dates. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const outcomeLabels = { accepted: 'Acceptée', rejected: 'Refusée' } as const
