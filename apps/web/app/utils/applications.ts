import type { ApplicationStatus } from '@piston/shared'

export const outcomeLabels = { accepted: 'Acceptée', rejected: 'Refusée' } as const

/**
 * Visual identity of each kanban column. Full class names (not built from the
 * color name) so Tailwind finds them when scanning the source.
 */
export const statusStyles = {
  to_send: {
    color: 'neutral',
    icon: 'i-lucide-inbox',
    dot: 'bg-neutral-400',
    accent: 'border-t-neutral-400',
  },
  sent: { color: 'info', icon: 'i-lucide-send', dot: 'bg-info', accent: 'border-t-info' },
  follow_up: {
    color: 'warning',
    icon: 'i-lucide-bell-ring',
    dot: 'bg-warning',
    accent: 'border-t-warning',
  },
  interview: {
    color: 'secondary',
    icon: 'i-lucide-messages-square',
    dot: 'bg-secondary',
    accent: 'border-t-secondary',
  },
  closed: {
    color: 'success',
    icon: 'i-lucide-flag',
    dot: 'bg-success',
    accent: 'border-t-success',
  },
} as const satisfies Record<
  ApplicationStatus,
  { color: string; icon: string; dot: string; accent: string }
>
