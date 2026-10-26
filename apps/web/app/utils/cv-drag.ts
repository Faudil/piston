/**
 * Options shared by every drag-and-drop list of the CV editor
 * (vue-draggable-plus / SortableJS). Dragging starts from a handle only, so
 * scrolling a form on a phone never moves anything by accident. On touch
 * screens a drag needs a long press (the finger staying still for 250 ms),
 * and any movement before that cancels it and lets the page scroll; the
 * handle itself allows vertical panning (see DragHandle.vue). The list scrolls
 * by itself near the edges. Every drag has a keyboard equivalent (the
 * up / down buttons), so the handle is hidden from assistive technologies.
 */
export type CvDragLevel = 'section' | 'item' | 'inner'

/** Lists are nested (sections > items > bullets): each level has its own handle class. */
export function cvDragOptions(level: CvDragLevel) {
  return { ...baseOptions, handle: `.cv-drag-${level}` }
}

const baseOptions = {
  animation: 160,
  delay: 250,
  delayOnTouchOnly: true,
  touchStartThreshold: 8,
  ghostClass: 'opacity-40',
  chosenClass: 'shadow-lg',
  scroll: true,
  scrollSensitivity: 90,
  scrollSpeed: 14,
  bubbleScroll: true,
} as const

/**
 * A two-way model over an array that is edited in place (the editor's state
 * is one deep reactive object): reading gives the array, writing replaces
 * its contents, so the parent's reference and the watchers stay intact.
 */
export function useInPlaceList<T>(source: () => T[]) {
  return computed<T[]>({
    get: () => source(),
    set: (next) => {
      const list = source()
      list.splice(0, list.length, ...next)
    },
  })
}
