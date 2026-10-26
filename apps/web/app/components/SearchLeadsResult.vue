<script setup lang="ts">
import type { SearchLeadsOutput } from '@piston/shared'

// `output` may be incomplete while Claude is still writing: every section is optional.
defineProps<{
  output: Partial<SearchLeadsOutput>
  /** Shows a "search offers" button on each suggested job (web search enabled). */
  searchable?: boolean
}>()
const emit = defineEmits<{ search: [jobTitle: string] }>()

const toast = useToast()

async function copy(keyword: string) {
  try {
    await navigator.clipboard.writeText(keyword)
    toast.add({ title: `« ${keyword} » copié`, icon: 'i-lucide-copy' })
  } catch {
    toast.add({ title: 'Impossible de copier.', color: 'error', icon: 'i-lucide-circle-alert' })
  }
}
</script>

<template>
  <div class="space-y-10">
    <section v-if="output.jobs?.length" aria-labelledby="leads-jobs">
      <AppSectionHeading
        id="leads-jobs"
        title="Métiers voisins"
        icon="i-lucide-route"
        description="Des postes proches de ton parcours, justifiés par ton CV."
      />
      <ul class="grid gap-3 lg:grid-cols-2">
        <li v-for="(job, i) in output.jobs" :key="i">
          <UCard class="h-full" :ui="{ body: 'flex h-full flex-col gap-3' }">
            <div class="flex-1 space-y-1">
              <p class="font-semibold text-highlighted">{{ job?.title }}</p>
              <p v-if="job?.why" class="text-sm text-pretty text-muted">{{ job.why }}</p>
            </div>
            <UButton
              v-if="searchable && job?.title"
              label="Chercher des offres"
              icon="i-lucide-search"
              color="primary"
              variant="soft"
              size="sm"
              class="self-start"
              :aria-label="`Chercher des offres de ${job.title}`"
              @click="emit('search', job.title)"
            />
          </UCard>
        </li>
      </ul>
    </section>

    <section v-if="output.keywords?.length" aria-labelledby="leads-keywords">
      <AppSectionHeading
        id="leads-keywords"
        title="Mots-clés à chercher"
        icon="i-lucide-tags"
        description="Clique sur un mot-clé pour le copier, puis colle-le sur ton site d'offres préféré."
      />
      <ul class="flex flex-wrap gap-2">
        <li v-for="(keyword, i) in output.keywords" :key="i">
          <UButton
            v-if="keyword"
            :label="keyword"
            trailing-icon="i-lucide-copy"
            color="neutral"
            variant="outline"
            size="sm"
            class="rounded-full"
            @click="copy(keyword)"
          />
        </li>
      </ul>
    </section>

    <section v-if="output.companyTypes?.length" aria-labelledby="leads-companies">
      <AppSectionHeading
        id="leads-companies"
        title="Types d'entreprises à viser"
        icon="i-lucide-building-2"
      />
      <ul class="grid gap-3 lg:grid-cols-2">
        <li
          v-for="(company, i) in output.companyTypes"
          :key="i"
          class="rounded-xl border border-default bg-default p-4"
        >
          <p class="font-medium text-highlighted">{{ company?.type }}</p>
          <p v-if="company?.why" class="mt-1 text-sm text-pretty text-muted">{{ company.why }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>
