<script setup lang="ts">
import type { CoverLetterOutput } from '@piston/shared'

/** Read-only display of a cover letter, one block per paragraph. */
defineProps<{ output: Partial<CoverLetterOutput> }>()
</script>

<template>
  <div class="max-w-prose space-y-4 leading-relaxed text-pretty text-default">
    <p v-for="(paragraph, i) in output.paragraphs ?? []" :key="i" class="whitespace-pre-line">
      {{ paragraph }}
    </p>
  </div>
</template>
