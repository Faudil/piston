<script setup lang="ts">
/**
 * Export actions of a cover letter: save it as a .txt file, open the print
 * view (the browser's « Enregistrer au format PDF » gives a PDF), or download
 * a PDF in the style of one of the user's CVs. The print view and the
 * matching PDF read the saved letter, so they need `generationId`, which the
 * editor leaves out while there are unsaved edits.
 */
const props = defineProps<{
  paragraphs: string[]
  /** File name without extension, e.g. "lettre-acme". */
  filename: string
  generationId?: string | null
  /** The letter's offer: its tailored CV comes first in the matching PDF menu. */
  offerId?: string
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
      label="Imprimer / PDF"
      icon="i-lucide-printer"
      color="neutral"
      variant="outline"
      :to="generationId ? `/impression/lettre/${generationId}` : undefined"
      target="_blank"
      :disabled="!generationId"
    />
    <LettersMatchingLetterButton :generation-id="generationId ?? null" :offer-id="offerId" />
  </div>
</template>
