// Shape of the user stored in the encrypted session cookie by nuxt-auth-utils.
declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    displayName: string
  }
}

export {}
