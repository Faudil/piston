// Shape of the user stored in the encrypted session cookie by nuxt-auth-utils.
declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    displayName: string
    /** Display hint only (shows the Administration link): the server reads users.is_admin. */
    isAdmin?: boolean
  }
}

declare module '#auth-utils' {
  interface UserSession {
    /** users.session_version at login; see isSessionCurrent(). */
    sessionVersion?: number
  }
}

export {}
