<script setup lang="ts">
import type { CvDocument, CvRevision } from '@piston/shared'

/**
 * The history of a document: creation, accepted AI edits, restorations and
 * periodic checkpoints of manual edits. « Restaurer » puts a revision back;
 * the current state is kept in the history first, so nothing is lost.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ documentId: string }>()
const emit = defineEmits<{ restored: [document: CvDocument] }>()

const toast = useToast()
const revisions = ref<CvRevision[]>([])
const loading = ref(false)
const restoring = ref<string | null>(null)

const SOURCES: Record<CvRevision['source'], { icon: string; label: string }> = {
  created: { icon: 'i-lucide-file-plus', label: 'Création' },
  manual: { icon: 'i-lucide-pencil', label: 'Modification' },
  ai: { icon: 'i-lucide-sparkles', label: 'Claude' },
  restore: { icon: 'i-lucide-history', label: 'Restauration' },
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

async function load() {
  loading.value = true
  try {
    revisions.value = await $fetch<CvRevision[]>(`/api/cv-documents/${props.documentId}/revisions`)
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    loading.value = false
  }
}

watch(open, (isOpen) => isOpen && load(), { immediate: true })

async function restore(revision: CvRevision) {
  restoring.value = revision.id
  try {
    const document = await $fetch<CvDocument>(
      `/api/cv-documents/${props.documentId}/revisions/${revision.id}/restore`,
      { method: 'POST' },
    )
    emit('restored', document)
    toast.add({ title: 'Version restaurée', icon: 'i-lucide-history' })
    await load()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    restoring.value = null
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Historique du CV"
    description="Chaque modification par Claude, chaque restauration et un point toutes les 15 minutes d’édition."
  >
    <template #body>
      <div v-if="loading && !revisions.length" class="space-y-2">
        <USkeleton v-for="i in 4" :key="i" class="h-14 w-full rounded-xl" />
      </div>
      <ol v-else class="space-y-2">
        <li
          v-for="(revision, index) in revisions"
          :key="revision.id"
          class="flex items-center gap-3 rounded-xl border border-default p-3"
        >
          <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-elevated text-muted">
            <UIcon :name="SOURCES[revision.source].icon" class="size-4" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">{{ revision.label }}</p>
            <p class="text-xs text-muted">
              {{ dateFormat.format(new Date(revision.createdAt)) }} ·
              {{ SOURCES[revision.source].label }}
            </p>
          </div>
          <UBadge
            v-if="index === 0"
            label="Plus récente"
            color="primary"
            variant="subtle"
            size="sm"
            class="hidden sm:inline-flex"
          />
          <UButton
            label="Restaurer"
            size="sm"
            color="neutral"
            variant="outline"
            :loading="restoring === revision.id"
            :disabled="Boolean(restoring)"
            :aria-label="`Restaurer « ${revision.label} »`"
            @click="restore(revision)"
          />
        </li>
      </ol>
    </template>
  </USlideover>
</template>
