<script setup lang="ts">
/**
 * « Exporter »: PDF, Word, and the share link dialog, for a saved CV document.
 * `beforeExport` lets the editor save pending changes first, so the file is the
 * CV on screen.
 */
const props = defineProps<{
  documentId: string
  beforeExport?: () => Promise<unknown>
  /** Size of the trigger button. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** Full-width trigger (mobile bar). */
  block?: boolean
}>()

const shareOpen = ref(false)

async function download(path: string) {
  await props.beforeExport?.()
  window.location.href = path
}

const items = computed(() => [
  [
    {
      label: 'PDF',
      description: 'Fidèle à l’aperçu, lisible par les logiciels de recrutement.',
      icon: 'i-lucide-file-down',
      onSelect: () => download(`/api/cv-documents/${props.documentId}/pdf?download=1`),
    },
    {
      label: 'Word (modifiable)',
      description: 'Structure et styles conservés ; la mise en page n’est pas identique au PDF.',
      icon: 'i-lucide-file-pen-line',
      onSelect: () => download(`/api/cv-documents/${props.documentId}/docx`),
    },
  ],
  [
    {
      label: 'Lien de partage…',
      description: 'Un lien en lecture seule vers le PDF, révocable.',
      icon: 'i-lucide-share-2',
      onSelect: async () => {
        await props.beforeExport?.()
        shareOpen.value = true
      },
    },
  ],
])
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton
      label="Exporter"
      icon="i-lucide-download"
      trailing-icon="i-lucide-chevron-down"
      color="neutral"
      variant="outline"
      :size="size ?? 'sm'"
      :block="block"
      :class="block && 'min-h-11 flex-1 justify-center'"
      aria-label="Exporter ou partager le CV"
    />
  </UDropdownMenu>
  <CvExportShareDialog v-model:open="shareOpen" :document-id="documentId" />
</template>
