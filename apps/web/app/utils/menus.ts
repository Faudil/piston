/**
 * Runs `open` (typically: open a dialog) once the dropdown menu that called it
 * has closed. Opened in the same tick, the dialog can be dismissed straight
 * away by the menu handing focus back to its trigger, which the dialog sees
 * as a focus outside: the likely cause of « Supprimer le profil » sometimes
 * doing nothing (reported on the CV page, not reproduced in Playwright).
 * Menus that open dialogs are also non-modal (`:modal="false"`), so they never
 * leave `pointer-events: none` on the page behind the dialog.
 */
export function afterMenuCloses(open: () => void) {
  setTimeout(open, 0)
}
