<script setup lang="ts">
/**
 * The editable letter: the salutation and the closing lines as light fixed
 * lines (LettersFixedLines), the body as numbered paragraphs that Claude can
 * rewrite one by one. The word count covers the body only.
 */
const parts = defineModel<LetterParts>({ required: true })
const props = defineProps<{
  wordTarget: { min: number; max: number }
  disabled?: boolean
  /** Body paragraph being rewritten by Claude, and what it has written so far. */
  rewriting?: { index: number; text: string } | null
}>()
const emit = defineEmits<{ rewrite: [bodyIndex: number]; stopRewrite: [] }>()

const wordCount = computed(() => countWords(parts.value.body))
const onTarget = computed(
  () => wordCount.value >= props.wordTarget.min && wordCount.value <= props.wordTarget.max,
)

function update<K extends keyof LetterParts>(key: K, value: LetterParts[K]) {
  parts.value = { ...parts.value, [key]: value }
}

function setParagraph(index: number, text: string) {
  const body = [...parts.value.body]
  body[index] = text
  update('body', body)
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

    <div v-for="(paragraph, i) in parts.body" :key="i" class="space-y-1.5">
      <div class="flex items-center justify-between gap-2">
        <label :for="`letter-paragraph-${i}`" class="text-xs font-medium text-muted">
          Paragraphe {{ i + 1 }}
        </label>
        <UButton
          v-if="rewriting?.index === i"
          label="Arrêter"
          icon="i-lucide-square"
          size="xs"
          color="neutral"
          variant="outline"
          @click="emit('stopRewrite')"
        />
        <UButton
          v-else
          label="Réécrire"
          icon="i-lucide-refresh-cw"
          size="xs"
          color="neutral"
          variant="ghost"
          :aria-label="`Réécrire le paragraphe ${i + 1}`"
          :disabled="disabled || Boolean(rewriting)"
          @click="emit('rewrite', i)"
        />
      </div>
      <div v-if="rewriting?.index === i" class="space-y-2" aria-live="polite">
        <StreamingIndicator text="Claude réécrit ce paragraphe…" />
        <UTextarea
          :id="`letter-paragraph-${i}`"
          :model-value="rewriting.text || paragraph"
          readonly
          autoresize
          class="w-full"
          :class="{ 'opacity-60': !rewriting.text }"
          :ui="{ base: 'leading-relaxed' }"
        />
      </div>
      <UTextarea
        v-else
        :id="`letter-paragraph-${i}`"
        :model-value="paragraph"
        autoresize
        :rows="2"
        :disabled="disabled"
        class="w-full"
        :ui="{ base: 'leading-relaxed' }"
        @update:model-value="setParagraph(i, String($event))"
      />
    </div>

    <LettersFixedLines
      v-if="parts.footer.length"
      :model-value="parts.footer"
      place="footer"
      :disabled="disabled"
      @update:model-value="update('footer', $event)"
    />

    <p
      class="flex items-center gap-2 text-sm"
      :class="onTarget ? 'text-muted' : 'text-warning'"
      aria-live="polite"
    >
      <UIcon :name="onTarget ? 'i-lucide-check' : 'i-lucide-info'" class="size-4 shrink-0" />
      <span>
        {{ wordCount }} mots dans le corps de la lettre
        <template v-if="!onTarget">
          — ce modèle vise entre {{ wordTarget.min }} et {{ wordTarget.max }} mots.
        </template>
      </span>
    </p>
  </div>
</template>
