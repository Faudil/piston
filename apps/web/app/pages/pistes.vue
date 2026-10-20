<script setup lang="ts">
import type { Generation, Paginated, SearchLeadsOutput } from '@piston/shared'

useSeoMeta({ title: 'Pistes' })

const { webSearch } = useFeatures()
const { start, partial, generation, pending, error } = useGeneration('search_leads')
const jobSearch = useTemplateRef('jobSearch')

// The latest saved leads are shown until a new generation starts.
const { data: latest } = await useFetch<Paginated<Generation<'search_leads'>>>(
  '/api/generations?kind=search_leads&pageSize=1',
)
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
        @click="start({})"
      />
    </template>

    <div class="space-y-12">
      <JobSearch v-if="webSearch" ref="jobSearch" />

      <section aria-labelledby="leads" class="space-y-4">
        <h2 id="leads" class="sr-only">Pistes de recherche</h2>

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
              { label: 'Trouver des pistes', icon: 'i-lucide-sparkles', onClick: () => start({}) },
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
