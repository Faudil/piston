// --- Word diff ------------------------------------------------------------------------

export interface DiffPart {
  type: 'same' | 'added' | 'removed'
  text: string
}

/**
 * Word-level diff (longest common subsequence on words), to
 * highlight what an edit changes. Falls back to "all removed, all added"
 * beyond 400 tokens per side, which keeps it instant on any CV text.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  // Tokens are words (or single punctuation marks) with their trailing
  // whitespace: spaces do not match on their own, and « municipal » still
  // matches when a comma is added after it.
  const tokenize = (value: string) =>
    value.match(/[\p{L}\p{N}'’[\]%€-]+\s*|[^\s\p{L}\p{N}'’[\]%€-]\s*|\s+/gu) ?? []
  const a = tokenize(before)
  const b = tokenize(after)
  if (a.length > 400 || b.length > 400) {
    return [
      ...(before ? [{ type: 'removed' as const, text: before }] : []),
      ...(after ? [{ type: 'added' as const, text: after }] : []),
    ]
  }
  // lengths[i][j] = LCS length of a[i:] and b[j:]
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i]![j] =
        a[i] === b[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!)
    }
  }
  const parts: DiffPart[] = []
  const push = (type: DiffPart['type'], text: string) => {
    const last = parts.at(-1)
    if (last?.type === type) last.text += text
    else parts.push({ type, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i]!)
      i++
      j++
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      push('removed', a[i++]!)
    } else {
      push('added', b[j++]!)
    }
  }
  while (i < a.length) push('removed', a[i++]!)
  while (j < b.length) push('added', b[j++]!)
  return parts
}
