<script setup lang="ts">
/**
 * Corrections the user wants on the current letter, in their own words.
 * Suggestion chips fill the textarea with common requests.
 */
defineProps<{ pending: boolean; disabled?: boolean }>()
const emit = defineEmits<{ submit: [instructions: string] }>()

const MAX_LENGTH = 1000
const SUGGESTIONS = [
  'Plus court',
  'Plus formel',
  'Mentionne mon stage chez …',
  'Enlève la phrase sur le télétravail',
  'Une accroche plus directe',
]

const instructions = ref('')
const textarea = useTemplateRef<{ textareaRef?: HTMLTextAreaElement }>('textarea')

/** Appends a suggestion on its own line, then lets the user complete it. */
function addSuggestion(suggestion: string) {
  const current = instructions.value.trim()
  instructions.value = current ? `${current}\n${suggestion}` : suggestion
  nextTick(() => textarea.value?.textareaRef?.focus())
}

function submit() {
  const text = instructions.value.trim()
  if (text) emit('submit', text)
}

/** Lets the parent clear the form once the corrections are applied. */
defineExpose({ reset: () => (instructions.value = '') })
</script>

<template>
  <form class="space-y-3" @submit.prevent="submit">
    <UFormField label="Que veux-tu corriger ?" :hint="`${instructions.length}/${MAX_LENGTH}`">
      <UTextarea
        ref="textarea"
        v-model="instructions"
        :rows="3"
        :maxlength="MAX_LENGTH"
        autoresize
        class="w-full"
        placeholder="Ex. : plus court, mentionne mon stage chez Globex…"
        :disabled="disabled || pending"
      />
    </UFormField>
    <div class="flex flex-wrap gap-2" role="group" aria-label="Suggestions de corrections">
      <UButton
        v-for="suggestion in SUGGESTIONS"
        :key="suggestion"
        :label="suggestion"
        size="xs"
        color="neutral"
        variant="soft"
        icon="i-lucide-plus"
        :disabled="disabled || pending"
        @click="addSuggestion(suggestion)"
      />
    </div>
    <UButton
      type="submit"
      label="Appliquer les corrections"
      icon="i-lucide-wand-sparkles"
      :loading="pending"
      :disabled="disabled || !instructions.trim()"
    />
  </form>
</template>
