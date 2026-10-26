/**
 * Nuxt UI theme: semantic colors and the few component defaults that give
 * the app its look. Palettes come from Tailwind, except `piston`, defined in
 * assets/css/main.css.
 */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'piston',
      secondary: 'violet',
      success: 'emerald',
      info: 'sky',
      warning: 'amber',
      error: 'red',
      neutral: 'stone',
    },
    card: {
      slots: {
        root: 'rounded-2xl shadow-xs shadow-neutral-900/5 dark:shadow-none',
      },
    },
    button: {
      slots: {
        // Touch screens: every button is at least 44 px tall (WCAG target size).
        base: 'rounded-lg pointer-coarse:min-h-11 pointer-coarse:min-w-11',
      },
    },
    empty: {
      slots: {
        root: 'rounded-2xl',
        title: 'font-semibold',
      },
    },
  },
})
