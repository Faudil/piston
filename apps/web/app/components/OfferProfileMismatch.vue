<script setup lang="ts">
import type { JobOffer, ResumeProfile } from '@piston/shared'

/**
 * Warns that an analysis or a letter was made with another resume profile than
 * the one the offer uses now. Older generations (before profiles) carry none.
 */
const props = defineProps<{
  subject: string
  usedProfileId: string | undefined
  offer: Pick<JobOffer, 'profileId'>
  /** What to do about it; the name of the profile now in use follows. */
  hint: string
  action?: string
}>()
const emit = defineEmits<{ action: [] }>()

// Same key as useResumeProfiles, so the profiles are fetched once.
const { data: profiles } = useFetch<ResumeProfile[]>('/api/profiles', {
  key: 'resume-profiles',
  default: () => [],
})
const current = computed(
  () =>
    profiles.value.find((profile) => profile.id === props.offer.profileId) ??
    profiles.value.find((profile) => profile.isDefault),
)
const usedName = computed(
  () => profiles.value.find((profile) => profile.id === props.usedProfileId)?.name,
)
const stale = computed(
  () => props.usedProfileId && current.value && props.usedProfileId !== current.value.id,
)
</script>

<template>
  <UAlert
    v-if="stale"
    color="warning"
    variant="subtle"
    icon="i-lucide-info"
    :title="
      usedName
        ? `${subject} a été faite avec le profil « ${usedName} ».`
        : `${subject} a été faite avec un autre profil de CV.`
    "
    :description="`${hint} « ${current?.name} ».`"
    :actions="
      action
        ? [{ label: action, color: 'neutral', variant: 'outline', onClick: () => emit('action') }]
        : []
    "
  />
</template>
