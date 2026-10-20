import { and, applications, desc, eq, jobOffers, type ApplicationRow } from '@piston/db'
import type {
  Application,
  ApplicationOutcome,
  ApplicationStatus,
  StatusChange,
  UpdateApplicationBody,
} from '@piston/shared'

interface ApplicationState {
  status: ApplicationStatus
  outcome: ApplicationOutcome | null
  notes: string
  statusHistory: StatusChange[]
}

/**
 * Pure transition logic for PATCH: returns the new state of an application.
 *
 * - A history entry is appended only when the status really changes.
 * - `outcome` only makes sense on a closed application: leaving `closed`
 *   resets it, and setting one on another status is rejected.
 */
export function applyStatusChange(
  current: ApplicationState,
  patch: UpdateApplicationBody,
  now: Date,
): ApplicationState {
  const status = patch.status ?? current.status
  const statusHistory =
    status === current.status
      ? current.statusHistory
      : [...current.statusHistory, { status, at: now.toISOString() }]

  let outcome = patch.outcome === undefined ? current.outcome : patch.outcome
  if (status !== 'closed') {
    if (patch.outcome) {
      throw createError({
        statusCode: 400,
        message: 'Le résultat ne peut être défini que sur une candidature terminée.',
      })
    }
    outcome = null
  }

  return { status, outcome, notes: patch.notes ?? current.notes, statusHistory }
}

export function toApplication(row: ApplicationRow, offer: Application['offer']): Application {
  return {
    id: row.id,
    jobOfferId: row.jobOfferId,
    status: row.status,
    outcome: row.outcome,
    notes: row.notes,
    statusHistory: row.statusHistory,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    offer,
  }
}

const offerColumns = { id: jobOffers.id, title: jobOffers.title, company: jobOffers.company }

/** All applications of the user with their offer, most recently updated first. */
export async function listApplications(userId: string) {
  const rows = await useDb()
    .select({ application: applications, offer: offerColumns })
    .from(applications)
    .innerJoin(jobOffers, eq(applications.jobOfferId, jobOffers.id))
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.updatedAt))
  return rows.map((r) => toApplication(r.application, r.offer))
}

/** Loads one application of the user (with its offer), or throws a 404. */
export async function getApplicationForUser(userId: string, id: string) {
  const [row] = await useDb()
    .select({ application: applications, offer: offerColumns })
    .from(applications)
    .innerJoin(jobOffers, eq(applications.jobOfferId, jobOffers.id))
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
  if (!row) throw createError({ statusCode: 404, message: 'Candidature introuvable.' })
  return row
}
