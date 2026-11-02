<script setup lang="ts">
/**
 * The composer that stays under the letter while it scrolls. It reworks the
 * whole letter, which needs corrections in the user's own words, or the
 * paragraphs picked in the editor, where corrections are optional. Suggestion
 * chips, shown while it has focus, fill the textarea with common requests.
 */
const props = defineProps<{
  pending: boolean
  disabled?: boolean
  /** Numbers of the paragraphs picked in the letter. None: the whole letter. */
  selected: number[]
}>()
const emit = defineEmits<{
  submit: [instructions: string]
  clearSelection: []
  selectAll: []
  stop: []
}>()

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

const picked = computed(() => props.selected.length > 0)
const pickedNames = computed(() =>
  new Intl.ListFormat('fr', { type: 'conjunction' }).format(props.selected.map(String)),
)
const scope = computed(() =>
  picked.value
    ? `${props.selected.length > 1 ? 'Paragraphes' : 'Paragraphe'} ${pickedNames.value}`
    : 'Toute la lettre',
)
const typed = computed(() => instructions.value.trim())
const canSubmit = computed(() => picked.value || Boolean(typed.value))
const submitLabel = computed(() => {
  if (!picked.value) return 'Appliquer les corrections'
  const target = props.selected.length > 1 ? 'ces paragraphes' : 'ce paragraphe'
  return typed.value ? `Corriger ${target}` : `Repasser sur ${target}`
})

function submit() {
  if (canSubmit.value && !props.pending) emit('submit', typed.value)
}

/** Enter sends, Shift+Enter starts a new line. Phones keep Enter for new lines. */
function onEnter(event: KeyboardEvent) {
  if (event.shiftKey || window.matchMedia('(pointer: coarse)').matches) return
  event.preventDefault()
  submit()
}

/** Lets the parent clear the form once the corrections are applied. */
defineExpose({ reset: () => (instructions.value = '') })
</script>

<template>
  <form
    class="group/composer rounded-2xl border border-default bg-default p-2 shadow-lg transition-colors focus-within:border-primary/50"
    @submit.prevent="submit"
  >
    <div class="flex flex-wrap items-center gap-2 px-1.5 pt-1 text-xs" aria-live="polite">
      <UIcon name="i-lucide-wand-sparkles" class="size-4 text-primary" />
      <UBadge :label="scope" :color="picked ? 'primary' : 'neutral'" variant="subtle" size="sm" />
      <UButton
        v-if="picked"
        label="Toute la lettre"
        size="xs"
        color="neutral"
        variant="link"
        class="p-0"
        :disabled="disabled || pending"
        @click="emit('clearSelection')"
      />
      <span v-else class="text-muted">
        ✨ vise un paragraphe, ou
        <button
          type="button"
          class="underline hover:text-highlighted disabled:opacity-50"
          :disabled="disabled || pending"
          @click="emit('selectAll')"
        >
          sélectionne tout</button
        >.
      </span>
      <AppUsageNotice class="ml-auto" />
    </div>

    <UTextarea
      ref="textarea"
      v-model="instructions"
      :rows="1"
      :maxrows="5"
      :maxlength="MAX_LENGTH"
      autoresize
      variant="none"
      class="w-full"
      :aria-label="picked ? 'Que veux-tu changer ? (facultatif)' : 'Que veux-tu corriger ?'"
      :placeholder="
        picked
          ? 'Une consigne, ou rien : Claude améliore le texte.'
          : 'Ex. : plus court, mentionne mon stage chez Globex…'
      "
      :disabled="disabled || pending"
      :ui="{ base: 'px-2 py-2' }"
      @keydown.enter="onEnter"
    />

    <!-- Unfolds while the composer has focus. -->
    <div
      class="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 group-focus-within/composer:grid-rows-[1fr] motion-reduce:transition-none"
    >
      <div class="overflow-hidden">
        <div
          class="flex gap-1.5 overflow-x-auto px-1 pb-2 sm:flex-wrap"
          role="group"
          aria-label="Suggestions de corrections"
        >
          <UButton
            v-for="suggestion in SUGGESTIONS"
            :key="suggestion"
            :label="suggestion"
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-lucide-plus"
            class="shrink-0 rounded-full"
            :disabled="disabled || pending"
            @mousedown.prevent
            @click="addSuggestion(suggestion)"
          />
        </div>
      </div>
    </div>

    <div class="flex items-center justify-end gap-2">
      <span v-if="instructions.length > MAX_LENGTH - 200" class="text-xs text-muted tabular-nums">
        {{ instructions.length }}/{{ MAX_LENGTH }}
      </span>
      <UButton
        v-if="pending"
        label="Arrêter"
        icon="i-lucide-square"
        color="neutral"
        variant="outline"
        class="rounded-full"
        @click="emit('stop')"
      />
      <UButton
        v-else
        type="submit"
        :label="submitLabel"
        trailing-icon="i-lucide-arrow-up"
        class="rounded-full"
        :disabled="disabled || !canSubmit"
      />
    </div>
  </form>
</template>
