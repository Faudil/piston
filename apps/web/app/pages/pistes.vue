<script setup lang="ts">
import type { Generation, Paginated, SearchLeadsOutput } from '@piston/shared'

useSeoMeta({ title: 'Pistes' })

const { webSearch } = useFeatures()
const { start, reset, partial, generation, pending, error } = useGeneration('search_leads')
const jobSearch = useTemplateRef('jobSearch')

// Leads are suggested from one resume profile (the default one unless another is picked).
const { profiles, defaultProfile } = await useResumeProfiles()
const chosenProfileId = ref<string | null>(null)
const profileId = computed(() => chosenProfileId.value ?? defaultProfile.value?.id)

// The latest saved leads of that profile are shown until a new generation starts.
const { data: latest } = await useFetch<Paginated<Generation<'search_leads'>>>('/api/generations', {
  query: computed(() => ({
    kind: 'search_leads',
    pageSize: 1,
    ...(profileId.value && { profileId: profileId.value }),
  })),
})

// Another profile: forget the leads being shown, the saved ones of that profile load.
watch(profileId, () => reset())

const findLeads = () => start(profileId.value ? { profileId: profileId.value } : {})
const saved = computed(() => latest.value?.items[0]?.output)

// While streaming, show what has been parsed so far; afterwards the saved result.
const shown = computed<Partial<SearchLeadsOutput> | undefined>(() =>
  pending.value || generation.value
    ? (partial.value ?? generation.value?.output)
    : (saved.value ?? undefined),
)
const hasResult = computed(() => Boolean(shown.value) || Boolean(saved.value))
</script>

<template>
  <AppPage
    title="Pistes"
    description="À partir de ton CV, Claude propose des métiers voisins, des mots-clés pour les sites d'offres et des types d'entreprises à viser."
  >
    <template #actions>
      <UButton
        v-if="hasResult"
        label="Régénérer"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="pending"
        @click="findLeads"
      />
    </template>

    <div class="space-y-12">
      <JobSearch v-if="webSearch" ref="jobSearch" />

      <section aria-labelledby="leads" class="space-y-4">
        <h2 id="leads" class="sr-only">Pistes de recherche</h2>

        <div v-if="profiles.length >= 2" class="max-w-sm">
          <ResumeProfileSelect
            :model-value="profileId ?? null"
            :profiles="profiles"
            :disabled="pending"
            description="Les pistes partent de la version actuelle de ce profil."
            @update:model-value="chosenProfileId = $event"
          />
        </div>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="error"
        >
          <template v-if="error.includes('CV')" #description>
            <ULink to="/cv" class="underline">Aller à la page CV</ULink>
          </template>
        </UAlert>

        <StreamingIndicator v-if="pending" />

        <div aria-live="polite">
          <SearchLeadsResult
            v-if="shown"
            :output="shown"
            :searchable="webSearch && !pending"
            @search="jobSearch?.searchFor($event)"
          />
          <ResultSkeleton v-else-if="pending" />
          <UEmpty
            v-else
            icon="i-lucide-compass"
            title="Pas encore de pistes"
            description="Claude lit ton CV et te propose des directions auxquelles tu n'as peut-être pas pensé."
            :actions="[
              { label: 'Trouver des pistes', icon: 'i-lucide-sparkles', onClick: findLeads },
            ]"
          />
        </div>
      </section>

      <p v-if="!webSearch" class="text-center text-xs text-dimmed">
        Recherche web désactivée : ajoute TAVILY_API_KEY dans .env pour chercher des offres depuis
        Piston.
      </p>
    </div>
  </AppPage>
</template>
