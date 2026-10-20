<script setup lang="ts">
import type { Generation } from '@piston/shared'

/**
 * Print view of a cover letter: just the text, no app chrome. Opens the
 * browser's print dialog on load (choose "Enregistrer au format PDF" to get a PDF).
 */
definePageMeta({ layout: false })

const route = useRoute()
const { data: generation, error } = await useFetch<Generation<'cover_letter'>>(
  `/api/generations/${route.params.id as string}`,
)
const paragraphs = computed(() => generation.value?.output.paragraphs ?? [])
useSeoMeta({ title: 'Lettre de motivation', robots: 'noindex' })

const print = () => window.print()
const close = () => window.close()

onMounted(() => {
  // Let the browser lay out the letter first, or the preview comes up empty.
  if (paragraphs.value.length) setTimeout(() => window.print(), 300)
})
</script>

<template>
  <main class="sheet">
    <p v-if="error || !generation" class="screen-only">Cette lettre est introuvable.</p>
    <template v-else>
      <div class="screen-only toolbar">
        <UButton label="Imprimer / PDF" icon="i-lucide-printer" @click="print" />
        <UButton label="Fermer" color="neutral" variant="ghost" @click="close" />
      </div>
      <p v-for="(paragraph, i) in paragraphs" :key="i" class="paragraph">{{ paragraph }}</p>
    </template>
  </main>
</template>

<style scoped>
.sheet {
  max-width: 42rem;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  background: white;
  color: #111;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 12pt;
  line-height: 1.55;
  min-height: 100vh;
}
.toolbar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
  font-family: system-ui, sans-serif;
}
.paragraph {
  margin: 0 0 1em;
  white-space: pre-line;
  text-align: justify;
  hyphens: auto;
  orphans: 3;
  widows: 3;
}
@media print {
  .screen-only {
    display: none !important;
  }
  .sheet {
    max-width: none;
    padding: 0;
    min-height: 0;
  }
  @page {
    margin: 2.2cm;
  }
}
</style>
