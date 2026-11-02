<script setup lang="ts">
import type { JobOffer, ResumeProfile } from '@piston/shared'

/**
 * « CV pour cette offre »: the resume profile behind the offer's analysis,
 * letter and tailored CV. With a single profile there is nothing to choose:
 * it names it and points to where another one can be added.
 */
const props = defineProps<{ offer: JobOffer; disabled?: boolean }>()
const emit = defineEmits<{ updated: [offer: JobOffer] }>()

const toast = useToast()

// Not awaited (useResumeProfiles is): this also opens inside a slideover.
// Same key as useResumeProfiles, so the profiles are fetched once.
const { data: profiles } = useFetch<ResumeProfile[]>('/api/profiles', {
  key: 'resume-profiles',
  default: () => [],
})
const used = computed(
  () =>
    profiles.value.find((profile) => profile.id === props.offer.profileId) ??
    profiles.value.find((profile) => profile.isDefault),
)

const saving = ref(false)

async function change(profileId: string | null) {
  if (profileId === props.offer.profileId) return
  saving.value = true
  try {
    emit(
      'updated',
      await $fetch<JobOffer>(`/api/offers/${props.offer.id}`, {
        method: 'PATCH',
        body: { profileId },
      }),
    )
    toast.add({
      title: 'CV modifié pour cette offre',
      description: 'La prochaine analyse, la prochaine lettre et le CV adapté s’appuieront dessus.',
      icon: 'i-lucide-check',
    })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="used" class="@container space-y-3">
    <!-- Full width in a narrow panel, a short field on a page. -->
    <div v-if="profiles.length >= 2" class="@lg:max-w-sm">
      <ResumeProfileSelect
        :model-value="offer.profileId"
        :profiles="profiles"
        allow-default
        require-resume
        label="CV pour cette offre"
        :disabled="disabled || saving"
        @update:model-value="change"
      />
    </div>
    <p v-else class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
      <UIcon name="i-lucide-file-user" class="size-4 text-primary" />
      <span>
        CV pour cette offre : <span class="font-medium text-highlighted">{{ used.name }}</span>
      </span>
      <ULink to="/cv" class="text-primary underline">Ajouter un autre profil de CV</ULink>
    </p>
    <UAlert
      v-if="!used.current"
      color="warning"
      variant="subtle"
      icon="i-lucide-info"
      :title="`Le profil « ${used.name} » n’a pas encore de CV.`"
      :actions="[{ label: 'Ajouter un CV', to: `/cv?profil=${used.id}`, color: 'neutral' }]"
    />
  </div>
</template>
