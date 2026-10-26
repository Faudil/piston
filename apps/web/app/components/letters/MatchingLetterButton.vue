<script setup lang="ts">
import { cvTemplates, type CvDocumentSummary } from '@piston/shared'

/**
 * « PDF assorti à mon CV »: the saved letter as a PDF with the header, colors
 * and fonts of one of the user's CV documents. With several CVs the user
 * picks one (the CV made for the letter's offer comes first); without any,
 * the PDF uses a neutral design. Disabled while the letter has unsaved edits
 * (`generationId` null), since the PDF is built from the saved version.
 */
const props = defineProps<{ generationId: string | null; offerId?: string }>()

const { data: documents } = useFetch<CvDocumentSummary[]>('/api/cv-documents', {
  server: false,
  lazy: true,
  default: () => [],
})

function download(cvDocumentId?: string) {
  if (!props.generationId) return
  const query = new URLSearchParams({ download: '1' })
  if (cvDocumentId) query.set('cvDocumentId', cvDocumentId)
  window.location.href = `/api/generations/${props.generationId}/letter-pdf?${query}`
}

const sorted = computed(() =>
  [...(documents.value ?? [])].sort(
    (a, b) => Number(b.offer?.id === props.offerId) - Number(a.offer?.id === props.offerId),
  ),
)

const items = computed(() => [
  sorted.value.map((document) => ({
    label: document.title,
    description: document.offer
      ? `CV pour ${document.offer.company || document.offer.title}`
      : cvTemplates[document.templateId].label,
    icon: 'i-lucide-file-user',
    onSelect: () => download(document.id),
  })),
])
</script>

<template>
  <UDropdownMenu
    v-if="sorted.length > 1"
    :items="items"
    :content="{ align: 'start' }"
    :disabled="!generationId"
  >
    <UButton
      label="PDF assorti à mon CV"
      icon="i-lucide-file-heart"
      trailing-icon="i-lucide-chevron-down"
      color="neutral"
      variant="outline"
      :disabled="!generationId"
      aria-label="Télécharger la lettre en PDF dans le style d’un de mes CV"
    />
  </UDropdownMenu>
  <UButton
    v-else
    label="PDF assorti à mon CV"
    icon="i-lucide-file-heart"
    color="neutral"
    variant="outline"
    :disabled="!generationId"
    @click="download(sorted[0]?.id)"
  />
</template>
