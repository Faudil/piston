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

const selectedId = ref<string>()
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
    toast.add({ title: apiErrorMessage(error), color: 'error' })
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
  if (await update(selected.value.id, patch)) toast.add({ title: 'Candidature mise à jour.' })
  saving.value = false
}

function onCreated(created: Application) {
  applications.value = [created, ...applications.value]
  rebuild()
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Candidatures">
        <template #right>
          <UButton label="Nouvelle candidature" icon="i-lucide-plus" @click="createOpen = true" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Horizontal scroll with snap on phones, five columns side by side on wide screens. -->
      <div
        class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 xl:grid xl:grid-cols-5 xl:overflow-visible"
      >
        <section
          v-for="status in applicationStatuses"
          :key="status"
          :aria-label="applicationStatusLabels[status]"
          class="flex w-72 shrink-0 snap-center flex-col rounded-lg bg-elevated/50 p-2 xl:w-auto"
        >
          <h2 class="flex items-center justify-between px-1 pb-2 text-sm font-semibold">
            {{ applicationStatusLabels[status] }}
            <UBadge :label="String(columns[status].length)" color="neutral" variant="subtle" />
          </h2>
          <VueDraggable
            v-model="columns[status]"
            group="applications"
            :animation="150"
            :delay="150"
            :delay-on-touch-only="true"
            class="flex min-h-24 flex-1 flex-col gap-2"
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
        :description="selected?.offer.company"
      >
        <template #body>
          <ApplicationDetail
            v-if="selected"
            :application="selected"
            :saving="saving"
            @save="save"
          />
        </template>
      </USlideover>

      <ApplicationCreateModal
        v-model:open="createOpen"
        :tracked-offer-ids="applications.map((a) => a.jobOfferId)"
        @created="onCreated"
      />
    </template>
  </UDashboardPanel>
</template>
