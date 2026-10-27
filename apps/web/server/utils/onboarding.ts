import { and, eq, sql, users } from '@piston/db'
import { onboardingHints, type OnboardingHint } from '@piston/shared'

/** The onboarding messages the user closed. Unknown ids (from older releases) are dropped. */
export async function getDismissedHints(userId: string): Promise<OnboardingHint[]> {
  const [row] = await useDb()
    .select({ dismissed: users.dismissedHints })
    .from(users)
    .where(eq(users.id, userId))
  return (row?.dismissed ?? []).filter((hint): hint is OnboardingHint =>
    (onboardingHints as readonly string[]).includes(hint),
  )
}

/** Marks one message as closed; closing it twice changes nothing. */
export async function dismissHint(userId: string, hint: OnboardingHint) {
  await useDb()
    .update(users)
    .set({ dismissedHints: sql`array_append(${users.dismissedHints}, ${hint})` })
    .where(and(eq(users.id, userId), sql`not (${hint} = any(${users.dismissedHints}))`))
}

/** Shows every message again (« Revoir l'introduction »). */
export async function resetHints(userId: string) {
  await useDb().update(users).set({ dismissedHints: [] }).where(eq(users.id, userId))
}
