<script setup lang="ts">
import { cvTemplates, type CvDocumentSummary } from '@piston/shared'

/**
 * « PDF assorti à mon CV »: the saved letter as a PDF with the header, colors
 * and fonts of one of the user's CV documents. With several CVs the user
 * picks one; without any, the PDF uses a neutral design.
 */
const props = defineProps<{ generationId: string }>()

const { data: documents } = useFetch<CvDocumentSummary[]>('/api/cv-documents', {
  server: false,
  lazy: true,
  default: () => [],
})

function download(cvDocumentId?: string) {
  const query = new URLSearchParams({ download: '1' })
  if (cvDocumentId) query.set('cvDocumentId', cvDocumentId)
  window.location.href = `/api/generations/${props.generationId}/letter-pdf?${query}`
}

const items = computed(() => [
  (documents.value ?? []).map((document) => ({
    label: document.title,
    description: document.offerCompany
      ? `CV pour ${document.offerCompany}`
      : cvTemplates[document.templateId].label,
    icon: 'i-lucide-file-user',
    onSelect: () => download(document.id),
  })),
])
</script>

<template>
  <UDropdownMenu v-if="(documents?.length ?? 0) > 1" :items="items" :content="{ align: 'start' }">
    <UButton
      label="PDF assorti à mon CV"
      icon="i-lucide-file-heart"
      trailing-icon="i-lucide-chevron-down"
      color="neutral"
      variant="outline"
      aria-label="Télécharger la lettre en PDF dans le style d’un de mes CV"
    />
  </UDropdownMenu>
  <UButton
    v-else
    label="PDF assorti à mon CV"
    icon="i-lucide-file-heart"
    color="neutral"
    variant="outline"
    @click="download(documents?.[0]?.id)"
  />
</template>
