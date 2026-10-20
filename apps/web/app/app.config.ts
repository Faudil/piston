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
        base: 'rounded-lg',
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
