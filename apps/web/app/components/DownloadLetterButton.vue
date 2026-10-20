<script setup lang="ts">
/**
 * Export actions of a cover letter: save it as a .txt file, or open the print
 * view (the browser's "Save as PDF" gives a PDF). The print view loads the
 * saved letter, so `generationId` is only needed for that button.
 */
const props = defineProps<{
  paragraphs: string[]
  /** File name without extension, e.g. "lettre-acme". */
  filename: string
  generationId?: string | null
}>()

function downloadTxt() {
  const blob = new Blob([props.paragraphs.join('\n\n') + '\n'], {
    type: 'text/plain;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${props.filename.replace(/[\\/:*?"<>|]+/g, '-')}.txt`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <UButton
      label="Télécharger (.txt)"
      icon="i-lucide-download"
      color="neutral"
      variant="outline"
      :disabled="!paragraphs.length"
      @click="downloadTxt"
    />
    <UButton
      v-if="generationId"
      label="Imprimer / PDF"
      icon="i-lucide-printer"
      color="neutral"
      variant="outline"
      :to="`/impression/lettre/${generationId}`"
      target="_blank"
    />
  </div>
</template>
