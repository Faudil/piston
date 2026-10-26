<script setup lang="ts">
import type { JobSearchBody, JobSearchResponse, JobSearchResult } from '@piston/shared'

/**
 * Live job search on job boards (Tavily, server side). Results link to the
 * original ad and can be imported into the new-offer form.
 * Only rendered when the `webSearch` feature is enabled.
 */
const LOCATION_KEY = 'piston:job-search-location'

const query = ref('')
const location = ref('')
const results = ref<JobSearchResult[] | null>(null)
const pending = ref(false)
const error = ref<string | null>(null)
const root = useTemplateRef<HTMLElement>('root')

// localStorage can throw (private browsing, blocked storage): the location is
// a convenience, never a reason to break the page.
onMounted(() => {
  try {
    location.value = localStorage.getItem(LOCATION_KEY) ?? ''
  } catch {
    /* ignore */
  }
})
function rememberLocation() {
  try {
    if (location.value.trim()) localStorage.setItem(LOCATION_KEY, location.value.trim())
    else localStorage.removeItem(LOCATION_KEY)
  } catch {
    /* ignore */
  }
}

async function search() {
  if (query.value.trim().length < 2 || pending.value) return
  pending.value = true
  error.value = null
  rememberLocation()
  try {
    const body: JobSearchBody = {
      query: query.value.trim(),
      ...(location.value.trim() ? { location: location.value.trim() } : {}),
    }
    const response = await $fetch<JobSearchResponse>('/api/jobs/search', { method: 'POST', body })
    results.value = response.results
  } catch (err) {
    error.value = apiErrorMessage(err, 'La recherche a échoué. Réessaie dans un instant.')
  } finally {
    pending.value = false
  }
}

/** Called by the page when a suggested job title is clicked. */
function searchFor(jobTitle: string) {
  query.value = jobTitle
  root.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  void search()
}
defineExpose({ searchFor })

/** Publication dates come from the job boards: some are missing or unparsable. */
function publishedDate(value: string) {
  return Number.isNaN(new Date(value).getTime()) ? null : formatDate(value)
}
const hostname = (source: string) => source.replace(/^www\./, '')
const importLink = (url: string) => `/offres?new=1&url=${encodeURIComponent(url)}`
</script>

<template>
  <section ref="root" aria-labelledby="job-search" class="scroll-mt-6">
    <AppSectionHeading
      id="job-search"
      title="Chercher des offres"
      icon="i-lucide-search"
      description="Piston cherche sur les sites d'emploi les annonces récentes qui correspondent."
    />

    <UCard>
      <form class="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end" @submit.prevent="search">
        <UFormField label="Poste recherché">
          <UInput
            v-model="query"
            icon="i-lucide-briefcase"
            placeholder="Ex. : product designer"
            :maxlength="200"
            size="lg"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Lieu" hint="Facultatif">
          <UInput
            v-model="location"
            icon="i-lucide-map-pin"
            placeholder="Ex. : Lyon, télétravail"
            :maxlength="100"
            size="lg"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          label="Rechercher"
          icon="i-lucide-search"
          size="lg"
          :loading="pending"
          :disabled="query.trim().length < 2"
          class="justify-center"
        />
      </form>
    </UCard>

    <div class="mt-4" aria-live="polite">
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="error"
      />

      <ul v-else-if="pending" class="grid gap-3 lg:grid-cols-2" aria-hidden="true">
        <li
          v-for="i in 4"
          :key="i"
          class="space-y-3 rounded-2xl border border-default bg-default p-5"
        >
          <USkeleton class="h-5 w-3/4" />
          <USkeleton class="h-3 w-1/3" />
          <USkeleton class="h-12 w-full" />
        </li>
      </ul>

      <UEmpty
        v-else-if="results && !results.length"
        icon="i-lucide-search-x"
        title="Aucune annonce trouvée"
        description="Essaie un intitulé plus court ou un autre lieu."
        variant="subtle"
      />

      <template v-else-if="results">
        <p class="mb-3 text-sm text-muted">
          {{ results.length }} annonce{{ results.length > 1 ? 's' : '' }} trouvée{{
            results.length > 1 ? 's' : ''
          }}
        </p>
        <ul class="grid gap-3 lg:grid-cols-2">
          <li v-for="result in results" :key="result.url">
            <UCard class="h-full" :ui="{ body: 'flex h-full flex-col gap-3' }">
              <div class="flex-1 space-y-2">
                <p class="leading-snug font-semibold text-pretty text-highlighted">
                  {{ result.title }}
                </p>
                <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span class="inline-flex items-center gap-1">
                    <UIcon name="i-lucide-globe" class="size-3.5" />
                    {{ hostname(result.source) }}
                  </span>
                  <template v-if="result.publishedDate && publishedDate(result.publishedDate)">
                    <span aria-hidden="true">·</span>
                    <time :datetime="result.publishedDate">
                      {{ publishedDate(result.publishedDate) }}
                    </time>
                  </template>
                </p>
                <p v-if="result.snippet" class="line-clamp-3 text-sm text-pretty text-toned">
                  {{ result.snippet }}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  :to="importLink(result.url)"
                  label="Importer"
                  icon="i-lucide-download"
                  size="sm"
                  :aria-label="`Importer l'annonce « ${result.title} »`"
                />
                <UButton
                  :to="result.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  external
                  label="Voir l'annonce"
                  trailing-icon="i-lucide-external-link"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
              </div>
            </UCard>
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>
