import type { AccessRequestStatus } from './usage'

/** Shapes returned by the /api/admin routes (dates are ISO strings). */

export interface AdminAccessRequest {
  id: string
  email: string
  displayName: string
  message: string | null
  status: AccessRequestStatus
  createdAt: string
  reviewedAt: string | null
  reviewedBy: string | null
}

export interface AdminUser {
  id: string
  email: string
  displayName: string
  isAdmin: boolean
  createdAt: string
  /** Last Claude or Tavily call, null if none. */
  lastActiveAt: string | null
  counts: { offers: number; applications: number; cvDocuments: number; generations: number }
  /** Claude calls and estimated cost (USD) over the last 30 days. */
  claude30d: { calls: number; costUsd: number }
  /** Tavily calls over the last 30 days. */
  web30d: { calls: number }
}

export interface AdminInvite {
  id: string
  createdAt: string
  expiresAt: string
  usedAt: string | null
  /** Display name of the member who created it, null for the CLI or a deleted account. */
  createdBy: string | null
  status: 'active' | 'used' | 'expired'
}

export interface AdminDailyUsage {
  /** YYYY-MM-DD, UTC. */
  day: string
  claudeCalls: number
  claudeCostUsd: number
  webCalls: number
}

export interface AdminOverview {
  totals: {
    users: number
    admins: number
    /** Members with at least one Claude or Tavily call in the last 7 days. */
    activeUsers7d: number
    pendingRequests: number
    activeInvites: number
    offers: number
    applications: number
    cvDocuments: number
    letters: number
    generations: number
  }
  /** Applications per kanban column. */
  applicationsByStatus: Record<string, number>
  claude: {
    today: { calls: number; limit: number }
    month: { costUsd: number; budgetUsd: number; calls: number }
    /** Estimated cost per generation kind, this month. */
    byOperation: { operation: string; calls: number; costUsd: number }[]
  }
  web: {
    today: { calls: number; limit: number }
    month: { credits: number; budget: number; calls: number }
  }
  /** Last 30 days, oldest first, days without calls included. */
  daily: AdminDailyUsage[]
}
