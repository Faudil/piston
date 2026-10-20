<script setup lang="ts">
import type { Generation, Paginated, SearchLeadsOutput } from '@piston/shared'

useSeoMeta({ title: 'Pistes' })

const { start, partial, generation, pending, error } = useGeneration('search_leads')

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
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Pistes" />
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-6">
        <p class="text-muted">
          À partir de ton CV, Claude propose des métiers voisins, des mots-clés pour les sites
          d'offres et des types d'entreprises à viser.
        </p>

        <UButton
          :label="hasResult ? 'Régénérer' : 'Trouver des pistes'"
          icon="i-lucide-compass"
          :loading="pending"
          @click="start({})"
        />

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

        <SearchLeadsResult v-if="shown" :output="shown" />
        <p v-else-if="!pending" class="text-sm text-muted">Aucune piste générée pour l'instant.</p>
      </div>
    </template>
  </UDashboardPanel>
</template>
