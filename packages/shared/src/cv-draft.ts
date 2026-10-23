import * as z from 'zod'
import {
  CV_LIMITS,
  CvContent,
  createCvItem,
  cvSectionKeys,
  cvSectionMaxItems,
  newCvId,
  type CvSectionConfig,
} from './cv'

/**
 * First draft of a CV document written by Claude (kind `cv_draft`), from an
 * existing resume version (« Créer depuis mon CV ») or from interview
 * answers (« Créer de zéro avec l'IA »).
 *
 * The draft has no ids and no section settings: `draftToContent` adds them
 * and cuts every value to the document limits (structured outputs ignore
 * length constraints, so they are enforced here).
 */

const date = (what: string) =>
  z.string().describe(`${what} as MM/YYYY or YYYY, exactly as known; empty string if not stated`)

export const CvDraftOutput = z.object({
  header: z.object({
    fullName: z.string(),
    title: z.string().describe('Job title the person targets or holds; empty if unknown'),
    email: z.string(),
    phone: z.string(),
    city: z.string(),
    links: z
      .array(z.object({ label: z.string(), url: z.string() }))
      .describe('Links written in the source (LinkedIn, portfolio...); never make one up'),
  }),
  summary: z
    .string()
    .describe('Short professional summary (accroche); empty if nothing supports it'),
  experiences: z
    .array(
      z.object({
        title: z.string(),
        organization: z.string(),
        location: z.string(),
        start: date('Start date'),
        end: z
          .string()
          .describe(
            'End date as MM/YYYY or YYYY, "Aujourd\'hui" for a current position, empty string if not stated',
          ),
        bullets: z.array(z.string()).describe('One achievement or responsibility per bullet'),
      }),
    )
    .describe('Most recent first'),
  education: z.array(
    z.object({
      degree: z.string(),
      school: z.string(),
      location: z.string(),
      start: date('Start date'),
      end: date('End or graduation date'),
      details: z.string().describe('Specialization, honors, thesis; empty if none'),
    }),
  ),
  skills: z
    .array(
      z.object({
        name: z.string().describe('Group name, e.g. "Outils"'),
        items: z.array(z.string()),
      }),
    )
    .describe('Skills grouped by theme'),
  languages: z.array(
    z.object({
      name: z.string(),
      level: z.string().describe('Level as stated (C1, courant...); empty if not stated'),
    }),
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      url: z.string(),
      start: date('Start date'),
      end: date('End date'),
      bullets: z.array(z.string()),
    }),
  ),
  certifications: z.array(
    z.object({ name: z.string(), issuer: z.string(), date: date('Date'), url: z.string() }),
  ),
  interests: z.array(z.object({ name: z.string(), details: z.string() })),
})
export type CvDraftOutput = z.infer<typeof CvDraftOutput>

const cut = (value: string, max: number) => value.trim().slice(0, max)

const DRAFT_SECTIONS = [
  'experiences',
  'education',
  'skills',
  'languages',
  'projects',
  'certifications',
  'interests',
] as const

/**
 * Turns a draft into a document: ids everywhere, values cut to the limits,
 * counts capped, and only the sections that have content made visible
 * (empty ones stay available, hidden, in the default order).
 */
export function draftToContent(draft: CvDraftOutput): CvContent {
  const header = {
    fullName: cut(draft.header.fullName, CV_LIMITS.shortText),
    title: cut(draft.header.title, CV_LIMITS.shortText),
    email: cut(draft.header.email, CV_LIMITS.shortText),
    phone: cut(draft.header.phone, CV_LIMITS.phone),
    city: cut(draft.header.city, CV_LIMITS.location),
    links: draft.header.links
      .filter((link) => link.url.trim())
      .slice(0, CV_LIMITS.links)
      .map((link) => ({
        id: newCvId(),
        label: cut(link.label, CV_LIMITS.linkLabel),
        url: cut(link.url, CV_LIMITS.url),
      })),
  }

  // Drafts have the v1 sections only; the others stay empty (and hidden).
  const lists: Record<string, unknown[]> = {}
  for (const section of DRAFT_SECTIONS) {
    lists[section] = (draft[section] as Array<Record<string, unknown>>)
      .slice(0, cvSectionMaxItems[section])
      .map((values) =>
        createCvItem(
          section,
          Object.fromEntries(
            Object.entries(values).map(([key, value]) => [
              key,
              typeof value === 'string' ? value.trim() : value,
            ]),
          ),
        ),
      )
  }

  const summary = cut(draft.summary, CV_LIMITS.summary)
  const sections: CvSectionConfig[] = cvSectionKeys.map((key) => ({
    key,
    title: '',
    visible: key === 'summary' ? Boolean(summary) : (lists[key]?.length ?? 0) > 0,
    column: 'auto',
  }))

  return CvContent.parse({ header, summary, ...lists, sections })
}
