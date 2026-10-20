import { wrapOffer, wrapResume } from './common'

/**
 * The user turn sent to Claude is split into blocks so the resume block can be
 * cached: it is identical across every call made by the same user.
 */
export interface UserMessageParts {
  /** The resume wrapped in <cv> tags. Cache breakpoint goes right after it. */
  resume: string
  /** Everything that changes from one call to the next. */
  request: string
}

export function buildUserMessage(input: {
  resume: string
  offer?: string
  instruction: string
}): UserMessageParts {
  return {
    resume: wrapResume(input.resume),
    request: [input.offer ? wrapOffer(input.offer) : '', input.instruction]
      .filter(Boolean)
      .join('\n\n'),
  }
}
