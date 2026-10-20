<script setup lang="ts">
import { generationKindLabels, type Generation, type Paginated } from '@piston/shared'

useSeoMeta({ title: 'Historique' })

const PAGE_SIZE = 10
const kindItems = [
  { label: 'Tout', value: 'all' },
  ...Object.entries(generationKindLabels).map(([value, label]) => ({ label, value })),
]

const kind = ref('all')
const page = ref(1)
const expanded = ref<string | null>(null)

const { data, error } = await useFetch<Paginated<Generation>>('/api/generations', {
  query: computed(() => ({
    page: page.value,
    pageSize: PAGE_SIZE,
    ...(kind.value === 'all' ? {} : { kind: kind.value }),
  })),
})

// Changing the filter goes back to the first page and closes any open item.
watch(kind, () => {
  page.value = 1
  expanded.value = null
})
watch(page, () => (expanded.value = null))

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
const formatDate = (iso: string) => dateFormat.format(new Date(iso))

function toggle(id: string) {
  expanded.value = expanded.value === id ? null : id
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Historique" />
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-4">
        <UFormField label="Type de génération">
          <USelect v-model="kind" :items="kindItems" class="w-full sm:w-64" />
        </UFormField>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          title="Impossible de charger l'historique."
        />

        <p v-else-if="!data?.items.length" class="text-sm text-muted">
          Rien dans l'historique pour l'instant.
        </p>

        <ul v-else class="space-y-3">
          <li v-for="item in data.items" :key="item.id">
            <UCard>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <UBadge :label="generationKindLabels[item.kind]" variant="subtle" />
                    <span class="text-sm">{{ formatDate(item.createdAt) }}</span>
                  </div>
                  <p class="text-xs text-muted">
                    {{ item.model }} · {{ item.inputTokens }} tokens en entrée ·
                    {{ item.outputTokens }} en sortie
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <UButton
                    v-if="item.inputRefs.offerId"
                    :to="`/offres/${item.inputRefs.offerId}`"
                    label="Voir l'offre"
                    icon="i-lucide-briefcase"
                    color="neutral"
                    variant="outline"
                    size="sm"
                  />
                  <UButton
                    :label="expanded === item.id ? 'Masquer' : 'Afficher'"
                    :icon="expanded === item.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    :aria-expanded="expanded === item.id"
                    color="neutral"
                    variant="soft"
                    size="sm"
                    @click="toggle(item.id)"
                  />
                </div>
              </div>

              <div v-if="expanded === item.id" class="mt-4 border-t border-default pt-4">
                <ResumeReviewResult v-if="item.kind === 'resume_review'" :output="item.output" />
                <OfferAnalysisResult
                  v-else-if="item.kind === 'offer_analysis'"
                  :output="item.output"
                />
                <CoverLetterView v-else-if="item.kind === 'cover_letter'" :output="item.output" />
                <SearchLeadsResult v-else :output="item.output" />
              </div>
            </UCard>
          </li>
        </ul>

        <UPagination
          v-if="data && data.total > PAGE_SIZE"
          v-model:page="page"
          :items-per-page="PAGE_SIZE"
          :total="data.total"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
