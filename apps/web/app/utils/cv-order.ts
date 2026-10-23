/**
 * Puts `after` (a reordering of `before`, a subset of `full`) back into
 * `full`: the entries of `before` keep their slots in the full list, filled
 * in the new order, and every other entry stays where it was. Used to drag
 * the sections shown in the editor while hidden empty ones stay put.
 */
export function reorderSubset<T>(
  full: readonly T[],
  before: readonly T[],
  after: readonly T[],
  key: (entry: T) => string,
): T[] {
  const moved = new Set(before.map(key))
  if (after.length !== before.length || !after.every((entry) => moved.has(key(entry)))) {
    return [...full]
  }
  const queue = [...after]
  return full.map((entry) => (moved.has(key(entry)) ? queue.shift()! : entry))
}
