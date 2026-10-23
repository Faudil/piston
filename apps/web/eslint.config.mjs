// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    // Formatting is Prettier's job; this rule contradicts its output (<input />).
    'vue/html-self-closing': 'off',
    // drizzle-orm is a dependency of @piston/db only: importing it here can
    // resolve locally from a stale install and then fail on a fresh one (CI).
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'drizzle-orm',
            message: 'Import query operators from @piston/db, which re-exports them.',
          },
        ],
      },
    ],
  },
})
