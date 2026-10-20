<script setup lang="ts">
import type { SearchLeadsOutput } from '@piston/shared'

// `output` may be incomplete while Claude is still writing: every section is optional.
defineProps<{ output: Partial<SearchLeadsOutput> }>()

const toast = useToast()

async function copy(keyword: string) {
  try {
    await navigator.clipboard.writeText(keyword)
    toast.add({ title: `« ${keyword} » copié`, icon: 'i-lucide-copy' })
  } catch {
    toast.add({ title: 'Impossible de copier.', color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-8">
    <section v-if="output.jobs?.length" aria-labelledby="leads-jobs" class="space-y-3">
      <h2 id="leads-jobs" class="text-lg font-semibold">Métiers voisins</h2>
      <div class="grid gap-3 lg:grid-cols-2">
        <UCard v-for="(job, i) in output.jobs" :key="i">
          <p class="font-medium">{{ job?.title }}</p>
          <p class="mt-1 text-sm text-muted">{{ job?.why }}</p>
        </UCard>
      </div>
    </section>

    <section v-if="output.keywords?.length" aria-labelledby="leads-keywords" class="space-y-3">
      <h2 id="leads-keywords" class="text-lg font-semibold">Mots-clés à chercher</h2>
      <p class="text-sm text-muted">Clique sur un mot-clé pour le copier.</p>
      <ul class="flex flex-wrap gap-2">
        <li v-for="(keyword, i) in output.keywords" :key="i">
          <UButton
            v-if="keyword"
            :label="keyword"
            icon="i-lucide-copy"
            color="neutral"
            variant="outline"
            size="sm"
            @click="copy(keyword)"
          />
        </li>
      </ul>
    </section>

    <section v-if="output.companyTypes?.length" aria-labelledby="leads-companies" class="space-y-3">
      <h2 id="leads-companies" class="text-lg font-semibold">Types d'entreprises à viser</h2>
      <div class="grid gap-3 lg:grid-cols-2">
        <UCard v-for="(company, i) in output.companyTypes" :key="i">
          <p class="font-medium">{{ company?.type }}</p>
          <p class="mt-1 text-sm text-muted">{{ company?.why }}</p>
        </UCard>
      </div>
    </section>
  </div>
</template>
