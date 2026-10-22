import type { GenerationRow, JobOfferRow } from '@piston/db'
import type { Generation, GenerationKind, JobOffer, Resume } from '@piston/shared'

/*
 * Database rows -> API shapes. The main job is to drop `userId` and turn
 * dates into ISO strings, so responses match the types in @piston/shared.
 */

export function toResume(row: {
  id: string
  profileId: string
  title: string
  rawText: string
  sourceFilename: string | null
  hasPdf: boolean
  isCurrent: boolean
  createdAt: Date
  updatedAt: Date
}): Resume {
  return {
    id: row.id,
    profileId: row.profileId,
    title: row.title,
    rawText: row.rawText,
    sourceFilename: row.sourceFilename,
    hasPdf: row.hasPdf,
    isCurrent: row.isCurrent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toJobOffer(row: JobOfferRow): JobOffer {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    rawText: row.rawText,
    url: row.url,
    profileId: row.profileId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toGeneration(row: GenerationRow): Generation {
  return {
    id: row.id,
    kind: row.kind as GenerationKind,
    inputRefs: row.inputRefs,
    output: row.output,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as Generation
}
