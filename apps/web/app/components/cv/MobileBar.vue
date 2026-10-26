<script setup lang="ts">
/**
 * Bottom action bar of the CV editor on phones: the preview, the export menu
 * and the AI panel, within thumb reach and above the home indicator. It takes
 * the place of the main tab bar on this page (see BottomNav).
 */
defineProps<{
  documentId: string
  aiActive: boolean
  beforeExport: () => Promise<unknown>
}>()
const emit = defineEmits<{ preview: []; ai: [] }>()
</script>

<template>
  <nav
    aria-label="Actions du CV"
    data-editor-bar
    class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
  >
    <div class="mx-auto flex max-w-lg items-center gap-2 p-2">
      <UButton
        icon="i-lucide-eye"
        color="primary"
        class="min-h-11 flex-1 justify-center"
        label="Aperçu"
        @click="emit('preview')"
      />
      <CvExportMenu :document-id="documentId" :before-export="beforeExport" size="lg" block />
      <UButton
        icon="i-lucide-sparkles"
        label="IA"
        color="neutral"
        :variant="aiActive ? 'solid' : 'outline'"
        class="min-h-11 flex-1 justify-center"
        :aria-pressed="aiActive"
        @click="emit('ai')"
      />
    </div>
  </nav>
</template>
