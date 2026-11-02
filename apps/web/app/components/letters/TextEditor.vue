<script setup lang="ts">
/**
 * The editable letter, laid out like a page: the salutation and the closing as
 * light fixed lines (LettersFixedLines), the body as paragraphs that read as
 * plain text until they are hovered or focused. Each one can be picked for
 * Claude to rework; Claude's text then streams in place, and a rewritten
 * paragraph can be put back. The word count covers the body only.
 */
const parts = defineModel<LetterParts>({ required: true })
/** Body paragraphs picked for Claude to rework. */
const selected = defineModel<number[]>('selected', { required: true })
const props = defineProps<{
  wordTarget: { min: number; max: number }
  disabled?: boolean
  /** Body paragraphs being rewritten by Claude, and what it has written so far. */
  rewriting?: Map<number, string> | null
  /** Body paragraphs Claude just rewrote that can still be put back. */
  rewritten?: ReadonlySet<number>
}>()
const emit = defineEmits<{ undo: [bodyIndex: number]; edited: [bodyIndex: number] }>()

const wordCount = computed(() => countWords(parts.value.body))
const onTarget = computed(
  () => wordCount.value >= props.wordTarget.min && wordCount.value <= props.wordTarget.max,
)
const wordProgress = computed(() =>
  Math.min(100, Math.round((wordCount.value / props.wordTarget.max) * 100)),
)

function update<K extends keyof LetterParts>(key: K, value: LetterParts[K]) {
  parts.value = { ...parts.value, [key]: value }
}

function toggle(index: number) {
  selected.value = selected.value.includes(index)
    ? selected.value.filter((i) => i !== index)
    : [...selected.value, index].toSorted((a, b) => a - b)
}

function setParagraph(index: number, text: string) {
  const body = [...parts.value.body]
  body[index] = text
  update('body', body)
  emit('edited', index)
}
</script>

<template>
  <div class="space-y-5">
    <LettersFixedLines
      v-if="parts.header.length"
      :model-value="parts.header"
      place="header"
      :disabled="disabled"
      @update:model-value="update('header', $event)"
    />

    <div class="-mx-2 space-y-1">
      <div
        v-for="(paragraph, i) in parts.body"
        :key="i"
        class="letter-paragraph group relative flex items-start gap-1 rounded-xl transition-colors duration-200"
        :class="[
          selected.includes(i) || rewriting?.has(i)
            ? 'bg-primary/8 ring-1 ring-primary/30'
            : 'hover:bg-elevated/70 focus-within:bg-elevated/70',
          { 'letter-paragraph--rewritten': rewritten?.has(i) },
        ]"
      >
        <div class="min-w-0 flex-1">
          <label :for="`letter-paragraph-${i}`" class="sr-only">Paragraphe {{ i + 1 }}</label>
          <p
            v-if="rewriting?.has(i)"
            :id="`letter-paragraph-${i}`"
            class="px-2.5 py-2 text-sm leading-relaxed whitespace-pre-wrap text-highlighted"
            aria-live="polite"
          >
            <template v-if="rewriting.get(i)">
              {{ rewriting.get(i) }}<span class="letter-caret" aria-hidden="true" />
            </template>
            <UChatShimmer v-else :text="paragraph" />
          </p>
          <UTextarea
            v-else
            :id="`letter-paragraph-${i}`"
            :model-value="paragraph"
            autoresize
            :rows="1"
            variant="none"
            :disabled="disabled"
            class="w-full"
            :ui="{ base: 'px-2.5 py-2 leading-relaxed' }"
            @update:model-value="setParagraph(i, String($event))"
          />
          <button
            v-if="rewritten?.has(i)"
            type="button"
            class="mb-2 ml-2.5 inline-flex items-center gap-1 text-xs text-muted hover:text-highlighted"
            @click="emit('undo', i)"
          >
            <UIcon name="i-lucide-undo-2" class="size-3" />
            Remettre l’ancien texte
          </button>
        </div>
        <UTooltip
          :text="selected.includes(i) ? 'Retirer de la sélection' : 'Retravailler avec Claude'"
        >
          <UButton
            role="checkbox"
            :aria-checked="selected.includes(i)"
            :aria-label="`Retravailler le paragraphe ${i + 1}`"
            :icon="selected.includes(i) ? 'i-lucide-check' : 'i-lucide-sparkles'"
            size="xs"
            :color="selected.includes(i) ? 'primary' : 'neutral'"
            :variant="selected.includes(i) ? 'solid' : 'ghost'"
            :disabled="disabled"
            class="mt-1.5 mr-1.5 shrink-0 rounded-full transition-opacity"
            :class="
              selected.includes(i)
                ? ''
                : 'sm:opacity-40 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
            "
            @click="toggle(i)"
          />
        </UTooltip>
      </div>
    </div>

    <LettersFixedLines
      v-if="parts.footer.length"
      :model-value="parts.footer"
      place="footer"
      :disabled="disabled"
      @update:model-value="update('footer', $event)"
    />

    <div class="space-y-1.5" aria-live="polite">
      <UProgress
        :model-value="wordProgress"
        :color="onTarget ? 'primary' : 'warning'"
        size="2xs"
        aria-hidden="true"
      />
      <p class="text-xs" :class="onTarget ? 'text-muted' : 'text-warning'">
        {{ wordCount }} mots dans le corps de la lettre
        <template v-if="!onTarget">
          — ce modèle vise entre {{ wordTarget.min }} et {{ wordTarget.max }} mots.
        </template>
      </p>
    </div>
  </div>
</template>

<style scoped>
/* A rewritten paragraph glows once, so the eye finds what changed. */
.letter-paragraph--rewritten {
  animation: letter-rewritten 1.6s ease-out;
}

.letter-caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--ui-primary);
  animation: letter-caret 1s steps(2, start) infinite;
}

@keyframes letter-rewritten {
  from {
    background-color: color-mix(in oklab, var(--ui-primary) 22%, transparent);
  }
}

@keyframes letter-caret {
  to {
    visibility: hidden;
  }
}

@media (prefers-reduced-motion: reduce) {
  .letter-paragraph--rewritten,
  .letter-caret {
    animation: none;
  }
}
</style>
