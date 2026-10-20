/**
 * Parses JSON that is still being streamed, e.g. `{"scores":{"impact":7,"mo`.
 *
 * Structured outputs arrive as raw JSON text. To render the result while
 * Claude writes it, we close whatever is open (strings, arrays, objects),
 * drop a dangling key or comma, and try to parse. Returns `undefined` when
 * nothing usable can be recovered yet.
 */
export function parsePartialJson<T = unknown>(input: string): Partial<T> | undefined {
  const closers: string[] = []
  let inString = false
  let escaped = false

  for (const char of input) {
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') closers.push('}')
    else if (char === '[') closers.push(']')
    else if (char === '}' || char === ']') closers.pop()
  }

  let candidate = input
  if (escaped) candidate = candidate.slice(0, -1)
  if (inString) candidate += '"'

  // Try progressively shorter prefixes until one parses once closed.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return JSON.parse(candidate + [...closers].reverse().join('')) as Partial<T>
    } catch {
      candidate = candidate
        .replace(/,\s*$/, '') // trailing comma
        .replace(/,?\s*"[^"]*"\s*:?\s*$/, '') // dangling key (or unfinished value string)
        .replace(/:\s*$/, '')
    }
  }
  return undefined
}
