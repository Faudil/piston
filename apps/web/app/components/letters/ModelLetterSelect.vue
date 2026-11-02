<script setup lang="ts">
import type { LetterSummary } from '@piston/shared'

/** Picks a previous letter whose structure and style a new letter will follow. */
const props = defineProps<{ letters: LetterSummary[]; disabled?: boolean }>()
const model = defineModel<string | null>({ required: true })

// Select values cannot be null: « no model » is a sentinel string.
const NONE = 'none'

const items = computed(() => [
  { label: 'Aucune, partir d’un modèle ci-dessous', value: NONE },
  ...props.letters.map((letter) => ({
    label: letter.offer.company
      ? `${letter.offer.title} — ${letter.offer.company}`
      : letter.offer.title,
    value: letter.generationId,
  })),
])
const selected = computed({
  get: () => model.value ?? NONE,
  set: (value: string) => (model.value = value === NONE ? null : value),
})
const chosen = computed(() => props.letters.find((letter) => letter.generationId === model.value))
</script>

<template>
  <div class="space-y-3">
    <UFormField label="Partir d’une lettre précédente" hint="Facultatif">
      <USelect
        v-model="selected"
        :items="items"
        :disabled="disabled"
        icon="i-lucide-copy"
        class="w-full"
      />
    </UFormField>
    <div v-if="chosen" class="rounded-xl bg-primary/5 p-4 text-sm ring-1 ring-primary/15">
      <p class="font-medium text-highlighted">Claude garde sa structure et ta façon d’écrire.</p>
      <p class="mt-1 text-muted">
        Il réécrit le fond pour cette offre, et ne reprend de tes expériences que ce qui figure dans
        ton CV.
      </p>
      <p
        v-if="chosen.excerpt"
        class="mt-3 line-clamp-3 border-s-2 border-primary/30 ps-3 text-toned"
      >
        {{ chosen.excerpt }}…
      </p>
    </div>
  </div>
</template>
