import * as z from 'zod'

/**
 * Schemas of the structured JSON that Claude returns for each feature.
 *
 * They are sent to the API as `output_config.format` (structured outputs), so
 * Claude is constrained to produce exactly this shape, and validated again on
 * our side before being stored. Field descriptions are part of the schema sent
 * to Claude: they double as instructions. Values themselves are written in French.
 *
 * Counts and ranges ("exactly 5", "0 to 10") are stated in descriptions rather
 * than as Zod constraints: structured outputs only support a subset of JSON
 * Schema, and a model that returns 6 strengths instead of 5 should not make
 * the whole generation fail.
 */

const score10 = z.number().describe('Integer score from 0 to 10')

export const atsStatuses = ['ok', 'warning', 'problem'] as const
export const AtsStatus = z.enum(atsStatuses)
export type AtsStatus = z.infer<typeof AtsStatus>

/**
 * How well the resume passes Applicant Tracking System filters. Judged from
 * the extracted plain text only: the layout itself is not visible to Claude.
 */
export const AtsReview = z.object({
  score: z.number().describe('Integer ATS compatibility score from 0 to 100'),
  checks: z
    .array(
      z.object({
        criterion: z.string().describe('Short French label of the criterion checked'),
        status: AtsStatus.describe(
          'ok: no issue; warning: could hurt or cannot be judged from the text; problem: likely filtered out or misparsed',
        ),
        detail: z.string().describe('What was observed, quoting the resume when relevant'),
        fix: z.string().describe('Concrete fix, or an empty string when the status is ok'),
      }),
    )
    .describe('6 to 10 checks, one per criterion'),
  summary: z.string().describe('One or two sentences summarizing the ATS compatibility'),
})
export type AtsReview = z.infer<typeof AtsReview>

export const ResumeReviewOutput = z.object({
  scores: z
    .object({
      lisibilite: score10,
      impact: score10,
      motsCles: score10,
      coherence: score10,
    })
    .describe('One score out of 10 per category'),
  ats: AtsReview.describe('Compatibility of the resume with ATS filters'),
  strengths: z
    .array(
      z.object({
        quote: z.string().describe('Exact sentence copied from the resume'),
        comment: z.string().describe('Why this sentence works'),
      }),
    )
    .describe('Exactly 5 strengths'),
  improvements: z
    .array(
      z.object({
        quote: z.string().describe('Exact sentence copied from the resume'),
        problem: z.string().describe('What is wrong, concretely'),
        suggestion: z.string().describe('How to fix it'),
      }),
    )
    .describe('Exactly 5 things to fix'),
  rewrite: z
    .array(
      z.object({
        original: z.string().describe('Original resume line, copied verbatim'),
        rewritten: z.string().describe('Rewritten version of that line'),
      }),
    )
    .describe('Line-by-line rewrite of the lines worth changing'),
})
export type ResumeReviewOutput = z.infer<typeof ResumeReviewOutput>

export const OfferAnalysisOutput = z.object({
  matchScore: z.number().describe('Integer match score from 0 to 100'),
  summary: z.string().describe('Two or three sentences summarizing the fit'),
  atsMatch: z
    .object({
      score: z
        .number()
        .describe(
          "Integer score from 0 to 100: share of the offer's important keywords present in the resume, weighted by importance",
        ),
      foundKeywords: z
        .array(z.string())
        .describe('Offer keywords found in the resume, as written in the offer'),
      missingKeywords: z
        .array(
          z.object({
            keyword: z.string().describe('Keyword as written in the offer'),
            suggestion: z
              .string()
              .describe(
                'How to add it honestly if the experience exists, or how to acquire it if not; never suggest claiming an absent skill',
              ),
          }),
        )
        .describe('Offer keywords absent from the resume'),
    })
    .describe('Keyword match between the offer and the resume, as an ATS would filter'),
  matchingSkills: z
    .array(
      z.object({
        skill: z.string(),
        evidence: z.string().describe('Specific resume experience that proves it'),
      }),
    )
    .describe('Skills required by the offer and present in the resume'),
  missingSkills: z
    .array(
      z.object({
        skill: z.string(),
        advice: z.string().describe('How to compensate or learn it'),
      }),
    )
    .describe('Skills required by the offer and missing from the resume'),
  interviewQuestions: z
    .array(
      z.object({
        question: z.string(),
        hint: z.string().describe('Resume element to build the answer on'),
      }),
    )
    .describe('Exactly 5 likely interview questions'),
  jargon: z
    .array(
      z.object({
        term: z.string().describe('HR expression as written in the offer'),
        meaning: z.string().describe('What it means in practice'),
      }),
    )
    .describe('HR jargon from the offer translated into plain language'),
})
export type OfferAnalysisOutput = z.infer<typeof OfferAnalysisOutput>

export const SearchLeadsOutput = z.object({
  jobs: z
    .array(
      z.object({
        title: z.string(),
        why: z.string().describe('Justification grounded in specific resume elements'),
      }),
    )
    .describe('Exactly 5 adjacent jobs, different from the ones already held'),
  keywords: z.array(z.string()).describe('Exactly 10 job-board search keywords'),
  companyTypes: z
    .array(
      z.object({
        type: z.string(),
        why: z.string(),
      }),
    )
    .describe('Exactly 5 types of target companies'),
})
export type SearchLeadsOutput = z.infer<typeof SearchLeadsOutput>

/**
 * The cover letter is the only free-text output. It is stored as a list of
 * paragraphs so a single one can be regenerated.
 */
export const CoverLetterOutput = z.object({
  paragraphs: z.array(z.string()),
})
export type CoverLetterOutput = z.infer<typeof CoverLetterOutput>

/**
 * Used when importing an offer from a URL: Claude turns the raw text of a web
 * page (navigation, cookie banners, footers...) into the job ad alone.
 * Not stored as a generation.
 */
export const ImportedOfferOutput = z.object({
  isJobOffer: z.boolean().describe('False if the page is not a job offer'),
  title: z.string().describe('Job title, as written in the ad'),
  company: z.string().describe('Hiring company, or empty string if unknown'),
  text: z
    .string()
    .describe(
      'The full job ad text, verbatim, without navigation, cookie notices, footers or other offers',
    ),
})
export type ImportedOfferOutput = z.infer<typeof ImportedOfferOutput>
