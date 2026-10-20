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

export const ResumeReviewOutput = z.object({
  scores: z
    .object({
      lisibilite: score10,
      impact: score10,
      motsCles: score10,
      coherence: score10,
    })
    .describe('One score out of 10 per category'),
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
