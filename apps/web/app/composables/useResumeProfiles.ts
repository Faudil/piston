import type { ResumeProfile } from '@piston/shared'

/**
 * The user's resume profiles (one CV per specialty), shared by every page
 * through a common fetch key. A failed fetch means "no profile".
 * Use as `await useResumeProfiles()` at the top of `<script setup>`.
 */
export async function useResumeProfiles() {
  const { data: profiles, refresh } = await useFetch<ResumeProfile[]>('/api/profiles', {
    key: 'resume-profiles',
    default: () => [],
  })
  const defaultProfile = computed(() => profiles.value.find((profile) => profile.isDefault))
  return { profiles, defaultProfile, refresh }
}
