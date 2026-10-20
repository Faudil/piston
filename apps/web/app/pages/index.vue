<script setup lang="ts">
import {
  applicationStatuses,
  applicationStatusLabels,
  type Application,
  type Generation,
  type Paginated,
  type Resume,
} from '@piston/shared'

useSeoMeta({ title: 'Accueil' })

// Failed calls fall back to empty data (`default`) so the dashboard never crashes.
const { data: resumes } = await useFetch<Resume[]>('/api/resumes', { default: () => [] })
const { data: reviews } = await useFetch<Paginated<Generation<'resume_review'>>>(
  '/api/generations?kind=resume_review&pageSize=1',
)
const { data: applications } = await useFetch<Application[]>('/api/applications', {
  default: () => [],
})

const currentResume = computed(() => resumes.value.find((r) => r.isCurrent))
const lastReview = computed(() => reviews.value?.items[0])

const scoreLabels = {
  lisibilite: 'Lisibilité',
  impact: 'Impact',
  motsCles: 'Mots-clés',
  coherence: 'Cohérence',
} as const

const countByStatus = computed(() =>
  applicationStatuses.map((status) => ({
    status,
    label: applicationStatusLabels[status],
    count: applications.value.filter((a) => a.status === status).length,
  })),
)
const openApplications = computed(() => applications.value.filter((a) => a.status !== 'closed'))

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })
const formatDate = (iso: string) => dateFormat.format(new Date(iso))
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Accueil" />
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-4xl space-y-4">
        <UButton
          to="/offres?new=1"
          label="Nouvelle offre"
          icon="i-lucide-plus"
          size="xl"
          block
          class="lg:w-auto"
        />

        <div class="grid gap-4 lg:grid-cols-2">
          <UCard>
            <template #header>
              <h2 class="font-semibold">CV courant</h2>
            </template>
            <template v-if="currentResume">
              <p class="font-medium">{{ currentResume.title }}</p>
              <p class="text-sm text-muted">Ajouté le {{ formatDate(currentResume.createdAt) }}</p>
              <UButton to="/cv" label="Gérer mon CV" variant="link" class="mt-2 px-0" />
            </template>
            <template v-else>
              <p class="text-sm text-muted">Tu n'as pas encore de CV.</p>
              <UButton to="/cv" label="Ajoute ton CV" class="mt-3" />
            </template>
          </UCard>

          <UCard>
            <template #header>
              <h2 class="font-semibold">Dernière critique</h2>
            </template>
            <template v-if="lastReview">
              <p class="text-sm text-muted">Le {{ formatDate(lastReview.createdAt) }}</p>
              <dl class="mt-2 grid grid-cols-2 gap-2">
                <div v-for="(label, key) in scoreLabels" :key="key">
                  <dt class="text-xs text-muted">{{ label }}</dt>
                  <dd class="font-semibold">{{ lastReview.output.scores?.[key] ?? '–' }} / 10</dd>
                </div>
              </dl>
              <UButton to="/cv" label="Voir la critique" variant="link" class="mt-2 px-0" />
            </template>
            <template v-else>
              <p class="text-sm text-muted">Aucune critique pour l'instant.</p>
              <UButton to="/cv" label="Critiquer mon CV" variant="outline" class="mt-3" />
            </template>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-semibold">Candidatures en cours</h2>
              <UButton to="/candidatures" label="Tout voir" variant="link" size="sm" />
            </div>
          </template>
          <ul class="flex flex-wrap gap-2">
            <li v-for="item in countByStatus" :key="item.status">
              <UBadge :label="`${item.label} : ${item.count}`" color="neutral" variant="subtle" />
            </li>
          </ul>
          <ul v-if="openApplications.length" class="mt-4 divide-y divide-default">
            <li
              v-for="application in openApplications"
              :key="application.id"
              class="flex items-center justify-between gap-2 py-2"
            >
              <NuxtLink :to="`/offres/${application.offer.id}`" class="min-w-0 truncate text-sm">
                <span class="font-medium">{{ application.offer.title }}</span>
                <span v-if="application.offer.company" class="text-muted">
                  · {{ application.offer.company }}
                </span>
              </NuxtLink>
              <span class="shrink-0 text-xs text-muted">
                {{ applicationStatusLabels[application.status] }}
              </span>
            </li>
          </ul>
          <p v-else class="mt-4 text-sm text-muted">Aucune candidature en cours.</p>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
