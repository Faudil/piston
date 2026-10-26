<script setup lang="ts">
import type { Generation } from '@piston/shared'

/**
 * Every version of a letter, newest first; one can be reopened. Each line
 * says what made the version (« Nouvelle lettre », « Corrections : … »,
 * « Paragraphe 2 réécrit ») and when, and names the template only when it
 * changed from the version before.
 */
const props = defineProps<{
  letters: Generation<'cover_letter'>[]
  currentId: string | null
  /** Disables reopening while Claude writes. */
  busy?: boolean
}>()
const emit = defineEmits<{ open: [letter: Generation<'cover_letter'>] }>()

const COLLAPSED_COUNT = 5
// Relative dates depend on the current time: rendered after hydration only.
const hydrated = useHydrated()
const expanded = ref(false)

const versions = computed(() =>
  props.letters.map((letter, i) => ({
    letter,
    label: letterVersionLabel(letter),
    // The list is newest first: the previous version is the next item.
    template: changedTemplateLabel(letter, props.letters[i + 1]),
  })),
)
const shown = computed(() =>
  expanded.value ? versions.value : versions.value.slice(0, COLLAPSED_COUNT),
)
</script>

<template>
  <div class="space-y-2">
    <ol class="divide-y divide-default rounded-xl border border-default bg-default">
      <li
        v-for="{ letter, label, template } in shown"
        :key="letter.id"
        class="flex items-center gap-3 p-3"
        :class="{ 'bg-primary/5': letter.id === currentId }"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-highlighted" :title="label">{{ label }}</p>
          <p class="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <time :datetime="letter.createdAt" :title="formatDateTime(letter.createdAt)">
              {{ hydrated ? formatRelative(letter.createdAt) : formatDateTime(letter.createdAt) }}
            </time>
            <UBadge v-if="template" :label="template" color="neutral" variant="subtle" size="sm" />
          </p>
        </div>
        <UBadge
          v-if="letter.id === currentId"
          label="Affichée"
          color="primary"
          variant="subtle"
          class="shrink-0"
        />
        <UButton
          v-else
          label="Rouvrir"
          icon="i-lucide-history"
          size="xs"
          color="neutral"
          variant="outline"
          class="shrink-0"
          :disabled="busy"
          :aria-label="`Rouvrir la version du ${formatDateTime(letter.createdAt)} (${label})`"
          @click="emit('open', letter)"
        />
      </li>
    </ol>
    <UButton
      v-if="versions.length > COLLAPSED_COUNT"
      :label="expanded ? 'Afficher moins' : `Afficher les ${versions.length} versions`"
      :trailing-icon="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
      color="neutral"
      variant="link"
      size="sm"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    />
  </div>
</template>
