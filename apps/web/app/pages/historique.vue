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

const kindIcons: Record<string, string> = {
  resume_review: 'i-lucide-file-search',
  offer_analysis: 'i-lucide-scan-search',
  cover_letter: 'i-lucide-pen-line',
  search_leads: 'i-lucide-compass',
}

function toggle(id: string) {
  expanded.value = expanded.value === id ? null : id
}
</script>

<template>
  <AppPage
    title="Historique"
    description="Tout ce que Claude a écrit pour toi : critiques, analyses, lettres et pistes."
    width="narrow"
  >
    <div class="space-y-5">
      <UFormField label="Type de génération" class="sm:w-64">
        <USelect v-model="kind" :items="kindItems" class="w-full" />
      </UFormField>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Impossible de charger l'historique."
      />

      <UEmpty
        v-else-if="!data?.items.length"
        icon="i-lucide-history"
        :title="kind === 'all' ? 'Ton historique est vide' : 'Rien de ce type pour l\'instant'"
        description="Chaque critique, analyse, lettre ou piste générée apparaîtra ici."
        :actions="[{ label: 'Critiquer mon CV', icon: 'i-lucide-sparkles', to: '/cv' }]"
      />

      <ul v-else class="space-y-3">
        <li v-for="item in data.items" :key="item.id">
          <UCard :ui="{ body: 'p-4 sm:p-5' }">
            <div class="flex flex-wrap items-center gap-3">
              <span
                class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
                aria-hidden="true"
              >
                <UIcon :name="kindIcons[item.kind] ?? 'i-lucide-sparkles'" class="size-5" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="font-medium text-highlighted">{{ generationKindLabels[item.kind] }}</p>
                <p class="text-sm text-muted">{{ formatDate(item.createdAt) }}</p>
              </div>
              <div class="flex w-full items-center gap-2 sm:w-auto">
                <UButton
                  v-if="item.inputRefs.offerId"
                  :to="`/offres/${item.inputRefs.offerId}`"
                  label="Voir l'offre"
                  icon="i-lucide-briefcase"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                />
                <UButton
                  :label="expanded === item.id ? 'Masquer' : 'Afficher'"
                  :trailing-icon="
                    expanded === item.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
                  "
                  :aria-expanded="expanded === item.id"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  class="ms-auto"
                  @click="toggle(item.id)"
                />
              </div>
            </div>

            <div v-if="expanded === item.id" class="mt-5 border-t border-default pt-5">
              <ResumeReviewResult v-if="item.kind === 'resume_review'" :output="item.output" />
              <OfferAnalysisResult
                v-else-if="item.kind === 'offer_analysis'"
                :output="item.output"
              />
              <CoverLetterView v-else-if="item.kind === 'cover_letter'" :output="item.output" />
              <SearchLeadsResult v-else :output="item.output" />
              <p class="mt-5 text-xs text-dimmed">
                {{ item.model }} · {{ item.inputTokens }} tokens en entrée ·
                {{ item.outputTokens }} en sortie
              </p>
            </div>
          </UCard>
        </li>
      </ul>

      <UPagination
        v-if="data && data.total > PAGE_SIZE"
        v-model:page="page"
        :items-per-page="PAGE_SIZE"
        :total="data.total"
        class="flex justify-center"
      />
    </div>
  </AppPage>
</template>
