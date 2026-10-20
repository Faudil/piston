<script setup lang="ts">
import {
  coverLetterToneLabels,
  CoverLetterTone,
  type CoverLetterOutput,
  type Generation,
} from '@piston/shared'

/**
 * Cover letter workflow of the offer page: pick a tone and up to 3 points to
 * highlight, generate, then edit paragraph by paragraph, regenerate a single
 * paragraph, copy, save.
 */
const props = defineProps<{
  offerId: string
  /** The latest letter of this offer, if one was already generated. */
  initial: Generation<'cover_letter'> | null
}>()

const toast = useToast()

const WORD_TARGET = { min: 250, max: 350 }
const MAX_HIGHLIGHTS = 3

const toneItems = CoverLetterTone.options.map((value) => ({
  value,
  label: coverLetterToneLabels[value],
}))
const tone = ref<CoverLetterTone>((props.initial?.inputRefs.tone as CoverLetterTone) ?? 'sobre')
const highlights = ref<string[]>(
  Array.from({ length: MAX_HIGHLIGHTS }, (_, i) => props.initial?.inputRefs.highlights?.[i] ?? ''),
)

// Two instances: the full letter and a single paragraph stream separately.
const letterGen = useGeneration('cover_letter')
const paragraphGen = useGeneration('cover_letter')

/** The generation the paragraphs below belong to (edits are saved onto it). */
const letterId = ref(props.initial?.id ?? null)
const paragraphs = ref<string[]>([...(props.initial?.output.paragraphs ?? [])])
const savedParagraphs = ref<string[]>([...paragraphs.value])
const regeneratingIndex = ref<number | null>(null)
const saving = ref(false)

const dirty = computed(
  () => JSON.stringify(paragraphs.value) !== JSON.stringify(savedParagraphs.value),
)
const wordCount = computed(() => paragraphs.value.join(' ').split(/\s+/).filter(Boolean).length)
const wordCountOk = computed(
  () => wordCount.value >= WORD_TARGET.min && wordCount.value <= WORD_TARGET.max,
)

function setLetter(generation: Generation<'cover_letter'>) {
  letterId.value = generation.id
  paragraphs.value = [...generation.output.paragraphs]
  savedParagraphs.value = [...generation.output.paragraphs]
}

function requestBody() {
  return {
    offerId: props.offerId,
    tone: tone.value,
    highlights: highlights.value.map((h) => h.trim()).filter(Boolean),
  }
}

async function generate() {
  if (
    dirty.value &&
    !window.confirm('Tes modifications non enregistrées seront perdues. Continuer ?')
  )
    return
  const generation = await letterGen.start(requestBody())
  if (generation) setLetter(generation)
}

async function regenerate(index: number) {
  if (!letterId.value || paragraphGen.pending.value) return
  regeneratingIndex.value = index
  const generation = await paragraphGen.start({
    ...requestBody(),
    regenerateParagraph: { generationId: letterId.value, index, paragraphs: paragraphs.value },
  })
  regeneratingIndex.value = null
  if (!generation) return
  // Only take the rewritten paragraph: the user may have edited others meanwhile.
  paragraphs.value[index] = generation.output.paragraphs[index] ?? paragraphs.value[index]!
  letterId.value = generation.id
  savedParagraphs.value = [...generation.output.paragraphs]
}

watch(paragraphGen.error, (message) => {
  if (message) toast.add({ title: message, color: 'error', icon: 'i-lucide-circle-alert' })
})

async function copy() {
  try {
    await navigator.clipboard.writeText(paragraphs.value.join('\n\n'))
    toast.add({ title: 'Lettre copiée', icon: 'i-lucide-copy' })
  } catch {
    toast.add({ title: 'Impossible de copier.', color: 'error' })
  }
}

async function save() {
  if (!letterId.value) return
  saving.value = true
  try {
    const generation = await $fetch<Generation<'cover_letter'>>(
      `/api/generations/${letterId.value}`,
      { method: 'PATCH', body: { paragraphs: paragraphs.value } },
    )
    setLetter(generation)
    toast.add({ title: 'Modifications enregistrées', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    saving.value = false
  }
}

onBeforeRouteLeave(() => {
  if (
    dirty.value &&
    !window.confirm('Tes modifications non enregistrées seront perdues. Quitter ?')
  )
    return false
})

/** Text shown live while the full letter is being written. */
const streamed = computed<Partial<CoverLetterOutput>>(() => ({
  paragraphs: letterGen.text.value.split(/\n\s*\n/),
}))
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-4">
      <URadioGroup
        v-model="tone"
        legend="Ton de la lettre"
        :items="toneItems"
        orientation="horizontal"
        variant="table"
      />
      <fieldset class="space-y-2">
        <legend class="text-sm font-medium">Points à mettre en avant (facultatif)</legend>
        <UFormField
          v-for="i in MAX_HIGHLIGHTS"
          :key="i"
          :label="`Point ${i}`"
          :ui="{ label: 'sr-only' }"
        >
          <UInput
            v-model="highlights[i - 1]"
            class="w-full"
            :maxlength="300"
            :placeholder="i === 1 ? 'Ex. : mon projet open source en Rust' : ''"
          />
        </UFormField>
      </fieldset>
      <UButton
        :label="paragraphs.length ? 'Régénérer la lettre' : 'Générer la lettre'"
        icon="i-lucide-pen-line"
        :loading="letterGen.pending.value"
        :disabled="paragraphGen.pending.value"
        @click="generate"
      />
    </div>

    <UAlert
      v-if="letterGen.error.value"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="letterGen.error.value"
    />

    <div
      v-if="letterGen.pending.value"
      aria-live="polite"
      class="rounded-lg border border-default p-4"
    >
      <CoverLetterView :output="streamed" />
    </div>

    <div v-else-if="paragraphs.length" class="space-y-4">
      <div v-for="(_, i) in paragraphs" :key="i" class="space-y-1">
        <UFormField :label="`Paragraphe ${i + 1}`" :ui="{ label: 'text-xs text-muted' }">
          <UTextarea
            v-if="regeneratingIndex === i"
            :model-value="paragraphGen.text.value || 'Réécriture en cours…'"
            readonly
            autoresize
            class="w-full"
            aria-live="polite"
          />
          <UTextarea v-else v-model="paragraphs[i]" autoresize :rows="2" class="w-full" />
        </UFormField>
        <UButton
          label="Régénérer ce paragraphe"
          icon="i-lucide-refresh-cw"
          size="xs"
          color="neutral"
          variant="ghost"
          :loading="regeneratingIndex === i"
          :disabled="paragraphGen.pending.value && regeneratingIndex !== i"
          @click="regenerate(i)"
        />
      </div>

      <p class="text-sm" :class="wordCountOk ? 'text-muted' : 'text-warning'" aria-live="polite">
        {{ wordCount }} mots
        <template v-if="!wordCountOk">
          — vise entre {{ WORD_TARGET.min }} et {{ WORD_TARGET.max }} mots.
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
          :disabled="!dirty || paragraphGen.pending.value"
          @click="save"
        />
      </div>
    </div>
  </div>
</template>
