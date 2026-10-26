<script setup lang="ts">
import type { Resume } from '@piston/shared'

const props = defineProps<{
  resumes: Resume[]
  /** Id of the version currently being reviewed, to show a spinner on its button. */
  reviewingId?: string | null
}>()

const emit = defineEmits<{
  review: [resume: Resume]
  setCurrent: [resume: Resume]
  /** A version was renamed or deleted: the parent reloads the list. */
  changed: []
}>()

const toast = useToast()

// --- Rename / delete (each with its own small modal) -------------------------

const renaming = ref<Resume | null>(null)
const renameOpen = computed({
  get: () => renaming.value !== null,
  set: (open) => {
    if (!open) renaming.value = null
  },
})
const newTitle = ref('')
const deleting = ref<Resume | null>(null)
const deleteOpen = computed({
  get: () => deleting.value !== null,
  set: (open) => {
    if (!open) deleting.value = null
  },
})
const busy = ref(false)

function startRename(resume: Resume) {
  newTitle.value = resume.title
  renaming.value = resume
}

async function run(action: () => Promise<unknown>, success: string) {
  busy.value = true
  try {
    await action()
    toast.add({ title: success, icon: 'i-lucide-check' })
    emit('changed')
    renaming.value = null
    deleting.value = null
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busy.value = false
  }
}

const rename = () =>
  run(
    () =>
      $fetch(`/api/resumes/${renaming.value!.id}`, {
        method: 'PATCH',
        body: { title: newTitle.value },
      }),
    'Version renommée',
  )
const remove = () =>
  run(() => $fetch(`/api/resumes/${deleting.value!.id}`, { method: 'DELETE' }), 'Version supprimée')

/** Secondary actions of a version, in its « … » menu. */
function menuItems(resume: Resume) {
  return [
    [
      {
        label: resume.hasPdf ? 'Télécharger le PDF' : 'Télécharger (.txt)',
        icon: 'i-lucide-download',
        to: `/api/resumes/${resume.id}/download`,
        external: true,
        download: true,
      },
      {
        label: 'Renommer',
        icon: 'i-lucide-pencil',
        onSelect: () => afterMenuCloses(() => startRename(resume)),
      },
    ],
    [
      {
        label: 'Créer un CV depuis cette version',
        icon: 'i-lucide-file-pen-line',
        to: {
          path: '/cv/nouveau',
          query: { mode: 'import', version: resume.id, profil: resume.profileId },
        },
      },
    ],
    [
      {
        label: 'Supprimer',
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        onSelect: () => afterMenuCloses(() => (deleting.value = resume)),
      },
    ],
  ]
}
</script>

<template>
  <ul class="space-y-2">
    <li
      v-for="resume in resumes"
      :key="resume.id"
      class="flex flex-col gap-3 rounded-2xl border bg-default p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between"
      :class="resume.isCurrent ? 'border-primary/40 ring-1 ring-primary/20' : 'border-default'"
    >
      <div class="flex min-w-0 items-center gap-3">
        <span
          class="grid size-10 shrink-0 place-items-center rounded-xl"
          :class="resume.isCurrent ? 'bg-primary/10 text-primary' : 'bg-elevated text-muted'"
        >
          <UIcon
            :name="resume.sourceFilename ? 'i-lucide-file-text' : 'i-lucide-file-type'"
            class="size-5"
          />
        </span>
        <div class="min-w-0">
          <p class="flex items-center gap-2 font-medium text-highlighted">
            <span class="truncate">{{ resume.title }}</span>
            <UBadge
              v-if="resume.isCurrent"
              label="Actuel"
              color="primary"
              variant="subtle"
              size="sm"
            />
          </p>
          <p class="truncate text-sm text-muted">
            {{ formatDateTime(resume.createdAt) }}
            <template v-if="resume.sourceFilename"> · {{ resume.sourceFilename }}</template>
          </p>
        </div>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <UButton
          v-if="!resume.isCurrent"
          label="Définir comme actuel"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="emit('setCurrent', resume)"
        />
        <UButton
          label="Critiquer"
          icon="i-lucide-sparkles"
          size="sm"
          :color="resume.isCurrent ? 'primary' : 'neutral'"
          :variant="resume.isCurrent ? 'solid' : 'outline'"
          :loading="reviewingId === resume.id"
          :disabled="Boolean(reviewingId) && reviewingId !== resume.id"
          :aria-label="`Critiquer « ${resume.title} »`"
          @click="emit('review', resume)"
        />
        <UDropdownMenu :items="menuItems(resume)" :modal="false" :content="{ align: 'end' }">
          <UButton
            icon="i-lucide-ellipsis"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="`Plus d'actions pour « ${resume.title} »`"
          />
        </UDropdownMenu>
      </div>
    </li>
  </ul>

  <UModal v-model:open="renameOpen" title="Renommer la version">
    <template #body>
      <form class="space-y-4" @submit.prevent="rename">
        <UFormField label="Titre" required>
          <UInput v-model="newTitle" class="w-full" :maxlength="120" autofocus />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="ghost" @click="renaming = null" />
          <UButton type="submit" label="Renommer" :loading="busy" :disabled="!newTitle.trim()" />
        </div>
      </form>
    </template>
  </UModal>

  <UModal
    v-model:open="deleteOpen"
    :title="`Supprimer « ${deleting?.title} » ?`"
    :description="
      deleting?.isCurrent && props.resumes.length > 1
        ? 'C\'est la version actuelle de ce profil : la plus récente des autres versions du profil la remplacera. Action définitive.'
        : 'Cette action est définitive.'
    "
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Annuler" color="neutral" variant="ghost" @click="deleting = null" />
        <UButton
          label="Supprimer"
          color="error"
          icon="i-lucide-trash-2"
          :loading="busy"
          @click="remove"
        />
      </div>
    </template>
  </UModal>
</template>
