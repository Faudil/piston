<script setup lang="ts">
import type { Generation, JobOffer, OfferAnalysisOutput } from '@piston/shared'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const offerId = route.params.id as string

const { data: offer, error: offerError } = await useFetch<JobOffer>(`/api/offers/${offerId}`)
const { data: previous } = await useFetch<{
  analysis: Generation<'offer_analysis'> | null
  coverLetter: Generation<'cover_letter'> | null
}>(`/api/offers/${offerId}/generations`)

useSeoMeta({ title: () => offer.value?.title ?? 'Offre' })

// --- Resume profile ---------------------------------------------------------

const { profiles, defaultProfile } = await useResumeProfiles()
const profileName = (id: string | undefined) => profiles.value.find((p) => p.id === id)?.name

/** The profile the next analysis or letter will use: the offer's, else the default one. */
const effectiveProfileId = computed(() => offer.value?.profileId ?? defaultProfile.value?.id)
const savingProfile = ref(false)

async function changeProfile(profileId: string | null) {
  if (!offer.value || profileId === offer.value.profileId) return
  savingProfile.value = true
  try {
    offer.value = await $fetch<JobOffer>(`/api/offers/${offerId}`, {
      method: 'PATCH',
      body: { profileId },
    })
    toast.add({
      title: 'CV utilisé modifié',
      description: "La prochaine analyse et la prochaine lettre s'appuieront dessus.",
      icon: 'i-lucide-check',
    })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    savingProfile.value = false
  }
}

// --- Analysis ---------------------------------------------------------------

const analysis = useGeneration('offer_analysis')

// While streaming, show what has been parsed so far; otherwise the last saved analysis.
const shownAnalysis = computed<Partial<OfferAnalysisOutput> | undefined>(() =>
  analysis.pending.value || analysis.generation.value
    ? (analysis.partial.value ?? analysis.generation.value?.output)
    : previous.value?.analysis?.output,
)

/**
 * Set when the analysis shown was made with another profile than the one the
 * offer now uses. Older analyses (made before profiles) carry no profile.
 */
const analysisProfileMismatch = computed(() => {
  const shown = analysis.pending.value
    ? undefined
    : (analysis.generation.value ?? previous.value?.analysis)
  const used = shown?.inputRefs.profileId
  if (!used || profiles.value.length < 2 || used === effectiveProfileId.value) return null
  return { used: profileName(used), next: profileName(effectiveProfileId.value) }
})

function analyze() {
  void analysis.start({ offerId })
}

onMounted(() => {
  // Coming from the creation form (?analyze=1): start right away, then drop
  // the flag so a page reload does not run (and bill) a second analysis.
  if (route.query.analyze === '1') {
    void router.replace({ query: {} })
    if (offer.value && !previous.value?.analysis) analyze()
  }
})

async function onDeleted() {
  toast.add({ title: 'Offre supprimée', icon: 'i-lucide-trash-2' })
  await navigateTo('/offres')
}

/** "lettre-acme" for the exported letter file. */
const letterFilename = computed(() => {
  const name = offer.value?.company || offer.value?.title || 'motivation'
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `lettre-${slug || 'motivation'}`
})

// --- Application ------------------------------------------------------------

const adding = ref(false)
const goToApplications = [{ label: 'Voir', to: '/candidatures', color: 'neutral' as const }]

async function addToApplications() {
  adding.value = true
  try {
    await $fetch('/api/applications', { method: 'POST', body: { jobOfferId: offerId } })
    toast.add({
      title: 'Ajoutée aux candidatures',
      icon: 'i-lucide-kanban',
      actions: goToApplications,
    })
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 409) {
      toast.add({
        title: 'Cette offre est déjà dans tes candidatures.',
        icon: 'i-lucide-info',
        actions: goToApplications,
      })
    } else {
      toast.add({ title: apiErrorMessage(err), color: 'error' })
    }
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <AppPage :title="offer?.title ?? 'Offre introuvable'" :back="{ to: '/offres', label: 'Offres' }">
    <template v-if="offer" #description>
      <span class="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        <span v-if="offer.company" class="inline-flex items-center gap-1.5 font-medium text-toned">
          <UIcon name="i-lucide-building-2" class="size-4" />
          {{ offer.company }}
        </span>
        <ULink
          v-if="offer.url"
          :to="offer.url"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 text-primary hover:underline"
        >
          Voir l'annonce <UIcon name="i-lucide-external-link" class="size-3.5" />
        </ULink>
      </span>
    </template>
    <template v-if="offer" #actions>
      <UButton
        label="Ajouter aux candidatures"
        icon="i-lucide-kanban"
        color="neutral"
        variant="outline"
        :loading="adding"
        @click="addToApplications"
      />
      <OfferManageActions :offer="offer" @updated="(o) => (offer = o)" @deleted="onDeleted" />
    </template>

    <UEmpty
      v-if="offerError || !offer"
      icon="i-lucide-file-question"
      title="Cette offre n'existe pas ou plus"
      description="Elle a peut-être été supprimée. Retrouve tes offres dans la liste."
      :actions="[{ label: 'Retour aux offres', to: '/offres', icon: 'i-lucide-arrow-left' }]"
    />

    <div v-else class="space-y-12">
      <UCollapsible
        class="rounded-2xl border border-default bg-default"
        :ui="{ content: 'px-4 pb-4 sm:px-5 sm:pb-5' }"
      >
        <UButton
          label="Texte de l'offre"
          icon="i-lucide-file-text"
          color="neutral"
          variant="ghost"
          trailing-icon="i-lucide-chevron-down"
          block
          class="group rounded-2xl p-4 sm:px-5"
          :ui="{ trailingIcon: 'ms-auto transition-transform group-data-[state=open]:rotate-180' }"
        />
        <template #content>
          <p class="max-w-prose text-sm leading-relaxed whitespace-pre-line text-toned">
            {{ offer.rawText }}
          </p>
        </template>
      </UCollapsible>

      <section aria-labelledby="analysis-title">
        <AppSectionHeading
          id="analysis-title"
          title="Analyse"
          icon="i-lucide-scan-search"
          description="Claude compare l'offre à ton CV : score, compétences, questions d'entretien."
        >
          <UButton
            v-if="shownAnalysis"
            label="Relancer"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :loading="analysis.pending.value"
            @click="analyze"
          />
        </AppSectionHeading>

        <div class="space-y-4">
          <div v-if="profiles.length >= 2" class="max-w-sm">
            <ResumeProfileSelect
              :model-value="offer.profileId"
              :profiles="profiles"
              allow-default
              :disabled="savingProfile || analysis.pending.value"
              description="Le profil de CV comparé à l'offre et utilisé pour la lettre."
              @update:model-value="changeProfile"
            />
          </div>
          <UAlert
            v-if="analysisProfileMismatch"
            color="warning"
            variant="subtle"
            icon="i-lucide-info"
            :title="
              analysisProfileMismatch.used
                ? `Cette analyse a été faite avec le profil « ${analysisProfileMismatch.used} ».`
                : 'Cette analyse a été faite avec un autre profil de CV.'
            "
            :description="`Relance-la pour utiliser « ${analysisProfileMismatch.next ?? 'le profil choisi'} ».`"
          />
          <UAlert
            v-if="analysis.error.value"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="analysis.error.value"
          >
            <template v-if="analysis.error.value.includes('CV')" #description>
              <ULink to="/cv" class="underline">Aller à la page CV</ULink>
            </template>
          </UAlert>
          <StreamingIndicator v-if="analysis.pending.value" />
          <div aria-live="polite">
            <OfferAnalysisResult v-if="shownAnalysis" :output="shownAnalysis" />
            <ResultSkeleton v-else-if="analysis.pending.value" />
            <UEmpty
              v-else
              icon="i-lucide-scan-search"
              title="Pas encore analysée"
              description="En une minute : ton score de correspondance, tes atouts, ce qui manque et les questions à préparer."
              :actions="[
                { label: 'Analyser l\'offre', icon: 'i-lucide-sparkles', onClick: analyze },
              ]"
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="letter-title">
        <AppSectionHeading
          id="letter-title"
          title="Lettre de motivation"
          icon="i-lucide-pen-line"
          description="Choisis un ton, ajoute jusqu'à trois points à mettre en avant, puis retouche chaque paragraphe."
        />
        <UCard>
          <CoverLetterEditor
            :offer-id="offerId"
            :filename="letterFilename"
            :initial="previous?.coverLetter ?? null"
          />
        </UCard>
      </section>

      <UButton
        label="Ajouter aux candidatures"
        icon="i-lucide-kanban"
        size="xl"
        block
        :loading="adding"
        @click="addToApplications"
      />
    </div>
  </AppPage>
</template>
