<script setup lang="ts">
import { coverLetterTemplateLabels, type Application, type LetterSummary } from '@piston/shared'

useSeoMeta({ title: 'Lettres' })

const { data: letters, error } = await useFetch<LetterSummary[]>('/api/letters')
const { data: applications } = await useFetch<Application[]>('/api/applications', {
  default: () => [],
})

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

/** Letters written from an application open its letter page; the others, their offer page. */
function letterLink(letter: LetterSummary) {
  return letter.applicationId
    ? `/candidatures/${letter.applicationId}/lettre`
    : `/offres/${letter.offer.id}`
}

// « Nouvelle lettre »: a letter is always written for an application, so pick one first.
const pickerOpen = ref(false)
const selectedApplication = ref<string>()
const applicationItems = computed(() =>
  (applications.value ?? []).map((a) => ({
    label: a.offer.company ? `${a.offer.title} — ${a.offer.company}` : a.offer.title,
    value: a.id,
  })),
)

async function startLetter() {
  if (!selectedApplication.value) return
  pickerOpen.value = false
  await navigateTo(`/candidatures/${selectedApplication.value}/lettre`)
}
</script>

<template>
  <AppPage
    title="Lettres de motivation"
    description="Toutes tes lettres, avec leurs versions. Ouvre-en une pour la corriger ou l'exporter."
  >
    <template #actions>
      <UButton label="Nouvelle lettre" icon="i-lucide-pen-line" @click="pickerOpen = true" />
    </template>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Impossible de charger tes lettres."
    />

    <section v-else-if="letters?.length" aria-labelledby="letters-list">
      <AppSectionHeading
        id="letters-list"
        title="Tes lettres"
        :description="`${letters.length} lettre${letters.length > 1 ? 's' : ''}`"
      />
      <ul class="grid gap-3">
        <li v-for="letter in letters" :key="letter.generationId">
          <NuxtLink
            :to="letterLink(letter)"
            class="group flex h-full items-start gap-4 rounded-2xl border border-default bg-default p-4 shadow-xs transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span
              class="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <UIcon name="i-lucide-pen-line" class="size-5" />
            </span>
            <span class="min-w-0 flex-1 space-y-1">
              <span class="block truncate font-medium text-highlighted">
                {{ letter.offer.title }}
              </span>
              <span class="block truncate text-sm text-muted">
                <template v-if="letter.offer.company">{{ letter.offer.company }} · </template>
                {{ dateFormat.format(new Date(letter.updatedAt)) }}
              </span>
              <span v-if="letter.excerpt" class="line-clamp-2 block text-sm text-toned">
                {{ letter.excerpt }}…
              </span>
              <span class="flex flex-wrap gap-1.5 pt-1">
                <UBadge
                  :label="coverLetterTemplateLabels[letter.template ?? 'classique']"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                />
                <UBadge
                  :label="`${letter.versions} version${letter.versions > 1 ? 's' : ''}`"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
                <UBadge
                  v-if="!letter.applicationId"
                  label="Depuis l'offre"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
              </span>
            </span>
            <UIcon
              name="i-lucide-chevron-right"
              class="mt-3 size-5 shrink-0 text-dimmed transition group-hover:translate-x-0.5 group-hover:text-primary"
            />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <UEmpty
      v-else
      icon="i-lucide-pen-line"
      title="Pas encore de lettre"
      description="Choisis une candidature : Claude écrit la lettre à partir de l'offre et de ton CV, puis tu la corriges à ta façon."
      :actions="[
        { label: 'Nouvelle lettre', icon: 'i-lucide-pen-line', onClick: () => (pickerOpen = true) },
      ]"
    />

    <UModal
      v-model:open="pickerOpen"
      title="Nouvelle lettre"
      description="Pour quelle candidature ?"
    >
      <template #body>
        <UEmpty
          v-if="!applicationItems.length"
          icon="i-lucide-kanban"
          title="Aucune candidature"
          description="Ajoute d'abord une offre à tes candidatures, puis reviens écrire sa lettre."
          variant="naked"
          :actions="[{ label: 'Mes candidatures', icon: 'i-lucide-kanban', to: '/candidatures' }]"
        />
        <UFormField v-else label="Candidature">
          <USelect
            v-model="selectedApplication"
            :items="applicationItems"
            placeholder="Choisis une candidature"
            class="w-full"
          />
        </UFormField>
      </template>
      <template v-if="applicationItems.length" #footer>
        <UButton label="Annuler" color="neutral" variant="ghost" @click="pickerOpen = false" />
        <UButton label="Écrire la lettre" :disabled="!selectedApplication" @click="startLetter" />
      </template>
    </UModal>
  </AppPage>
</template>
