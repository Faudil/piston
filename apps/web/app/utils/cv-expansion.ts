import type { InjectionKey } from 'vue'

/**
 * Which cards of the CV editor are expanded: sections and items, by id. The
 * content editor owns it and provides it to the cards below, so that a click
 * on the preview can open the right section and item before focusing a field.
 */
export interface CvExpansion {
  isOpen(id: string): boolean
  toggle(id: string): void
  open(id: string): void
}

export const CV_EXPANSION: InjectionKey<CvExpansion> = Symbol('cv-expansion')

export function createCvExpansion(initiallyOpen: Iterable<string> = []): CvExpansion {
  const open = ref(new Set<string>(initiallyOpen))
  const change = (update: (set: Set<string>) => void) => {
    const next = new Set(open.value)
    update(next)
    open.value = next
  }
  return {
    isOpen: (id) => open.value.has(id),
    toggle: (id) => change((set) => (set.delete(id) ? undefined : set.add(id))),
    open: (id) => change((set) => set.add(id)),
  }
}

/** The provided expansion, or a private one when a card is used on its own. */
export function useCvExpansion(): CvExpansion {
  return inject(CV_EXPANSION, null) ?? createCvExpansion()
}
