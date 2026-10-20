<script setup lang="ts">
import {
  coverLetterTemplateLabels,
  type CoverLetterTemplate,
  type Generation,
} from '@piston/shared'

/** Every version of the application's letter, newest first; one can be reopened. */
defineProps<{
  letters: Generation<'cover_letter'>[]
  currentId: string | null
  /** Disables reopening while Claude writes. */
  busy?: boolean
}>()
const emit = defineEmits<{ open: [letter: Generation<'cover_letter'>] }>()

const EXCERPT_LENGTH = 80

function templateLabel(letter: Generation<'cover_letter'>) {
  // Letters written before templates existed used the classic structure.
  const template = (letter.inputRefs.template ?? 'classique') as CoverLetterTemplate
  return coverLetterTemplateLabels[template] ?? coverLetterTemplateLabels.classique
}

/** What made this version: corrections, a rewritten paragraph, or a new letter. */
function origin(letter: Generation<'cover_letter'>) {
  const { revisionInstructions, paragraphIndex } = letter.inputRefs
  if (revisionInstructions) {
    const excerpt =
      revisionInstructions.length > EXCERPT_LENGTH
        ? `${revisionInstructions.slice(0, EXCERPT_LENGTH)}…`
        : revisionInstructions
    return `corrections : ${excerpt}`
  }
  if (paragraphIndex !== undefined) return `paragraphe ${paragraphIndex + 1} réécrit`
  return 'nouvelle lettre'
}
</script>

<template>
  <ol class="divide-y divide-default rounded-lg border border-default">
    <li
      v-for="letter in letters"
      :key="letter.id"
      class="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="min-w-0">
        <p class="text-sm font-medium">
          <time :datetime="letter.createdAt">{{ formatDateTime(letter.createdAt) }}</time>
          · {{ templateLabel(letter) }}
        </p>
        <p class="truncate text-sm text-muted">{{ origin(letter) }}</p>
      </div>
      <UBadge
        v-if="letter.id === currentId"
        label="Version affichée"
        color="primary"
        variant="subtle"
        class="self-start sm:self-center"
      />
      <UButton
        v-else
        label="Rouvrir"
        icon="i-lucide-history"
        size="xs"
        color="neutral"
        variant="outline"
        class="self-start sm:self-center"
        :disabled="busy"
        :aria-label="`Rouvrir la version du ${formatDateTime(letter.createdAt)}`"
        @click="emit('open', letter)"
      />
    </li>
  </ol>
</template>
