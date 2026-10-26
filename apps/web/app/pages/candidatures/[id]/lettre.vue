<script setup lang="ts">
import type { Application, Generation, JobOffer } from '@piston/shared'

/**
 * Cover letter of one application. The editor is the offer page's one
 * (LettersEditor): an offer has a single history of letters. From here,
 * Claude also reads the application's notes.
 */
const route = useRoute()
const applicationId = route.params.id as string

const { data: application, error: applicationError } = await useFetch<Application>(
  `/api/applications/${applicationId}`,
)

// The letter uses the offer's resume profile (the default one if the offer has none).
const { profiles, defaultProfile } = await useResumeProfiles()
const { data: offer } = await useFetch<JobOffer>(
  () => `/api/offers/${application.value?.jobOfferId}`,
  { immediate: Boolean(application.value) },
)
const usedProfile = computed(
  () => profiles.value.find((p) => p.id === offer.value?.profileId) ?? defaultProfile.value,
)

useSeoMeta({ title: () => `Lettre — ${application.value?.offer.title ?? 'Candidature'}` })

const letter = shallowRef<Generation<'cover_letter'> | null>(null)
</script>

<template>
  <AppPage
    v-if="applicationError || !application"
    title="Candidature introuvable"
    :back="{ to: '/candidatures', label: 'Candidatures' }"
    width="narrow"
  >
    <UEmpty
      icon="i-lucide-file-question"
      title="Cette candidature n'existe pas ou plus"
      description="Elle a peut-être été supprimée avec son offre. Retrouve tes candidatures sur le tableau."
      :actions="[
        { label: 'Retour aux candidatures', to: '/candidatures', icon: 'i-lucide-arrow-left' },
      ]"
    />
  </AppPage>

  <AppPage
    v-else
    title="Lettre de motivation"
    :back="{ to: '/candidatures', label: 'Candidatures' }"
    width="narrow"
  >
    <template #description>
      Pour <span class="font-medium text-highlighted">{{ application.offer.title }}</span>
      <template v-if="application.offer.company"> chez {{ application.offer.company }}</template
      >. Les notes de ta candidature (nom du recruteur, recommandation…) sont prises en compte.
    </template>
    <template #actions>
      <UButton
        :to="`/offres/${application.offer.id}`"
        label="Voir l'offre"
        icon="i-lucide-briefcase"
        color="neutral"
        variant="outline"
      />
    </template>

    <div class="space-y-8">
      <p v-if="usedProfile" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <UIcon name="i-lucide-file-user" class="size-4 text-primary" />
        <span>
          CV utilisé : <span class="font-medium text-highlighted">{{ usedProfile.name }}</span>
          <template v-if="!offer?.profileId && profiles.length > 1"> (profil par défaut)</template>
        </span>
        <ULink
          v-if="profiles.length > 1"
          :to="`/offres/${application.jobOfferId}`"
          class="text-primary underline"
        >
          Changer sur la page de l'offre
        </ULink>
      </p>

      <LettersEditor
        :offer-id="application.jobOfferId"
        :application-id="application.id"
        :filename="letterFilename(application.offer.company || application.offer.title)"
        :heading-level="2"
        @change="letter = $event"
      />

      <OfferNextSteps
        v-if="letter && offer"
        :offer="offer"
        :application="application"
        :letter-id="letter.id"
      />
    </div>
  </AppPage>
</template>
