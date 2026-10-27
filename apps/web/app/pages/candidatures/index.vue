<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import {
  applicationStatuses,
  applicationStatusLabels,
  type Application,
  type ApplicationStatus,
  type UpdateApplicationBody,
} from '@piston/shared'

useSeoMeta({ title: 'Candidatures' })

const toast = useToast()
const { data: applications } = await useFetch<Application[]>('/api/applications', {
  default: () => [],
})

// One array per column: vue-draggable-plus mutates these arrays while dragging,
// so they are a local copy of the server data, rebuilt whenever it changes.
function groupByStatus(list: Application[]) {
  const columns = Object.fromEntries(applicationStatuses.map((s) => [s, [] as Application[]]))
  for (const application of list) columns[application.status]!.push(application)
  return columns as Record<ApplicationStatus, Application[]>
}
const columns = ref(groupByStatus(applications.value))
const rebuild = () => (columns.value = groupByStatus(applications.value))

// `?candidature=<id>` (links from an offer page) opens that application's details.
const route = useRoute()
const router = useRouter()
const selectedId = ref<string | undefined>(
  typeof route.query.candidature === 'string' ? route.query.candidature : undefined,
)
watch(selectedId, (id) => {
  if (!id && route.query.candidature) void router.replace({ query: {} })
})
const selected = computed(() => applications.value.find((a) => a.id === selectedId.value))
const detailOpen = computed({
  get: () => Boolean(selected.value),
  set: (open) => {
    if (!open) selectedId.value = undefined
  },
})
const createOpen = ref(false)
const saving = ref(false)

function replace(updated: Application) {
  applications.value = applications.value.map((a) => (a.id === updated.id ? updated : a))
  rebuild()
}

/** Sends a change to the API. Throws nothing: on failure the board is rolled back. */
async function update(id: string, patch: UpdateApplicationBody) {
  try {
    replace(await $fetch<Application>(`/api/applications/${id}`, { method: 'PATCH', body: patch }))
    return true
  } catch (error) {
    rebuild() // roll back the optimistic move
    toast.add({ title: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
    return false
  }
}

/** Optimistic move used by the arrow buttons: the card jumps, then the API confirms. */
function move(application: Application, status: ApplicationStatus) {
  columns.value[application.status] = columns.value[application.status].filter(
    (a) => a.id !== application.id,
  )
  columns.value[status] = [{ ...application, status }, ...columns.value[status]]
  return update(application.id, { status })
}

/** Called by the target column after a drag-and-drop: the card is already in it. */
function onDropped(status: ApplicationStatus) {
  const dropped = columns.value[status].find((a) => a.status !== status)
  if (dropped) void update(dropped.id, { status })
}

async function save(patch: UpdateApplicationBody) {
  if (!selected.value) return
  saving.value = true
  if (await update(selected.value.id, patch)) {
    toast.add({ title: 'Candidature mise à jour', icon: 'i-lucide-check' })
  }
  saving.value = false
}

function onCreated(created: Application) {
  applications.value = [created, ...applications.value]
  rebuild()
}
</script>

<template>
  <AppPage
    tip="candidatures"
    title="Candidatures"
    description="Suis chaque candidature, de l'envoi à la réponse. Glisse une carte ou utilise ses flèches pour la changer de colonne."
    width="wide"
  >
    <template #actions>
      <UButton label="Nouvelle candidature" icon="i-lucide-plus" @click="createOpen = true" />
    </template>

    <UEmpty
      v-if="!applications.length"
      icon="i-lucide-kanban"
      title="Aucune candidature suivie"
      description="Ajoute une offre à tes candidatures pour la suivre ici, colonne par colonne."
      :actions="[
        {
          label: 'Nouvelle candidature',
          icon: 'i-lucide-plus',
          onClick: () => (createOpen = true),
        },
        { label: 'Voir mes offres', to: '/offres', color: 'neutral', variant: 'outline' },
      ]"
      class="mb-8"
    />

    <!-- Horizontal scroll with snap on phones, five columns side by side on wide screens. -->
    <div
      class="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 xl:mx-0 xl:grid xl:grid-cols-5 xl:overflow-visible xl:px-0"
    >
      <section
        v-for="status in applicationStatuses"
        :key="status"
        :aria-labelledby="`column-${status}`"
        class="flex w-[17rem] shrink-0 snap-start flex-col rounded-2xl border-t-4 bg-elevated/60 p-2 xl:w-auto"
        :class="statusStyles[status].accent"
      >
        <h2
          :id="`column-${status}`"
          class="flex items-center gap-2 px-2 pt-1 pb-3 text-sm font-semibold text-highlighted"
        >
          <UIcon :name="statusStyles[status].icon" class="size-4 text-muted" />
          <span class="flex-1">{{ applicationStatusLabels[status] }}</span>
          <span
            class="min-w-6 rounded-full bg-default px-2 py-0.5 text-center text-xs font-medium text-muted"
            :aria-label="`${columns[status].length} candidature(s)`"
          >
            {{ columns[status].length }}
          </span>
        </h2>
        <VueDraggable
          v-model="columns[status]"
          group="applications"
          :animation="150"
          :delay="150"
          :delay-on-touch-only="true"
          ghost-class="opacity-40"
          class="flex min-h-28 flex-1 flex-col gap-2 rounded-xl"
          @add="onDropped(status)"
        >
          <ApplicationCard
            v-for="application in columns[status]"
            :key="application.id"
            :application="application"
            @open="selectedId = application.id"
            @move="move(application, $event)"
          />
        </VueDraggable>
      </section>
    </div>

    <USlideover
      v-model:open="detailOpen"
      :title="selected?.offer.title"
      :description="selected?.offer.company || undefined"
    >
      <template #body>
        <ApplicationDetail v-if="selected" :application="selected" :saving="saving" @save="save" />
      </template>
    </USlideover>

    <ApplicationCreateModal
      v-model:open="createOpen"
      :tracked-offer-ids="applications.map((a) => a.jobOfferId)"
      @created="onCreated"
    />
  </AppPage>
</template>
