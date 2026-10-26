<script setup lang="ts">
import type { CoverLetterOutput } from '@piston/shared'

/**
 * Read-only display of a cover letter: the salutation and the closing lines
 * in a lighter tone, the body paragraphs in between (see utils/letters.ts).
 * Also used while Claude streams, with the paragraphs written so far.
 */
const props = defineProps<{ output: Partial<CoverLetterOutput> }>()

const parts = computed(() => splitLetter(props.output.paragraphs ?? []))
</script>

<template>
  <div class="max-w-prose space-y-4 leading-relaxed text-pretty text-default">
    <p v-for="(line, i) in parts.header" :key="`h${i}`" class="text-muted">{{ line }}</p>
    <p v-for="(paragraph, i) in parts.body" :key="`b${i}`" class="whitespace-pre-line">
      {{ paragraph }}
    </p>
    <p v-for="(line, i) in parts.footer" :key="`f${i}`" class="text-muted">{{ line }}</p>
  </div>
</template>
