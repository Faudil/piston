<script setup lang="ts">
/**
 * Editable letter of the application page: one textarea per paragraph, a
 * word counter against the template's target, Copy and Save. The page owns
 * the paragraphs (v-model) because the corrections form sends them too.
 *
 * Not CoverLetterEditor: that one also owns generation for the offer page,
 * while here generation, corrections and versions live in the page.
 */
const paragraphs = defineModel<string[]>({ required: true })
const props = defineProps<{
  wordTarget: { min: number; max: number }
  dirty: boolean
  saving: boolean
  disabled?: boolean
  /** Export: file name (no extension) and saved letter, for the print view. */
  filename?: string
  generationId?: string | null
}>()
const emit = defineEmits<{ save: [] }>()

const toast = useToast()

const wordCount = computed(() => paragraphs.value.join(' ').split(/\s+/).filter(Boolean).length)
const onTarget = computed(
  () => wordCount.value >= props.wordTarget.min && wordCount.value <= props.wordTarget.max,
)

async function copy() {
  try {
    await navigator.clipboard.writeText(paragraphs.value.join('\n\n'))
    toast.add({ title: 'Lettre copiée', icon: 'i-lucide-copy' })
  } catch {
    toast.add({ title: 'Impossible de copier.', color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-4">
    <UFormField
      v-for="(_, i) in paragraphs"
      :key="i"
      :label="`Paragraphe ${i + 1}`"
      :ui="{ label: 'text-xs text-muted' }"
    >
      <UTextarea v-model="paragraphs[i]" autoresize :rows="2" :disabled="disabled" class="w-full" />
    </UFormField>

    <p class="text-sm" :class="onTarget ? 'text-muted' : 'text-warning'" aria-live="polite">
      {{ wordCount }} mots
      <template v-if="!onTarget">
        — ce modèle vise entre {{ wordTarget.min }} et {{ wordTarget.max }} mots.
      </template>
    </p>

    <div class="flex flex-wrap gap-2">
      <UButton
        label="Copier"
        icon="i-lucide-copy"
        color="neutral"
        variant="outline"
        @click="copy"
      />
      <UButton
        label="Enregistrer les modifications"
        icon="i-lucide-save"
        color="neutral"
        variant="outline"
        :loading="saving"
        :disabled="!dirty || disabled"
        @click="emit('save')"
      />
    </div>
    <div v-if="filename" class="space-y-1">
      <DownloadLetterButton
        :paragraphs="paragraphs"
        :filename="filename"
        :generation-id="dirty ? null : generationId"
      />
      <p v-if="dirty" class="text-xs text-muted">
        Enregistre tes modifications pour pouvoir imprimer cette version.
      </p>
    </div>
  </div>
</template>
