import * as z from 'zod'

// Validation messages are shown to users (forms and API errors): use French.
z.config(z.locales.fr())

export * from './api'
export * from './enums'
export * from './limits'
export * from './models'
export * from './outputs'
export * from './sse'
export * from './cv'
export * from './cv-api'
export * from './cv-checks'
export * from './cv-text'
export * from './cv-draft'
export * from './cv-operations'
