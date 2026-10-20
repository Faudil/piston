<script setup lang="ts">
import type { CoverLetterOutput } from '@piston/shared'

/** Read-only display of a cover letter, one block per paragraph. */
defineProps<{ output: Partial<CoverLetterOutput> }>()
</script>

<template>
  <div class="space-y-4">
    <p v-for="(paragraph, i) in output.paragraphs ?? []" :key="i" class="whitespace-pre-line">
      {{ paragraph }}
    </p>
  </div>
</template>
