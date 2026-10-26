<script setup lang="ts">
import {
  coverLetterToneLabels,
  coverLetterWordTargets,
  CoverLetterTone,
  type CoverLetterOutput,
  type CoverLetterTemplate,
  type Generation,
} from '@piston/shared'

/**
 * The cover letter of an offer, used by the offer page and by the letter page
 * of its application: choose a template, a tone and points to highlight,
 * generate, edit (the body paragraph by paragraph, the salutation and the
 * closing inline), rewrite one paragraph, ask Claude for corrections, go back
 * to a previous version, copy, save and export.
 *
 * An offer has one history of letters, whichever page they were written
 * from. Every Claude answer is a new version (history is append-only); manual
 * edits are saved onto the version being shown. With `applicationId`, Claude
 * also reads the application's notes.
 */
const props = withDefaults(
  defineProps<{
    offerId: string
    applicationId?: string | null
    /** File name (no extension) of the exports. */
    filename: string
    /** Level of the section headings: 3 inside a page section, 2 on a page of its own. */
    headingLevel?: 2 | 3
  }>(),
  { applicationId: null, headingLevel: 3 },
)
const emit = defineEmits<{ change: [letter: Generation<'cover_letter'> | null] }>()

const toast = useToast()

const {
  data: letters,
  error: loadError,
  refresh: refreshLetters,
} = await useFetch<Generation<'cover_letter'>[]>(`/api/offers/${props.offerId}/letters`, {
  default: () => [],
})

// --- Options of the next letter ------------------------------------------------

const MAX_HIGHLIGHTS = 3
const latest = letters.value[0]
const template = ref<CoverLetterTemplate>(latest ? letterTemplate(latest) : 'classique')
const tone = ref<CoverLetterTone>((latest?.inputRefs.tone as CoverLetterTone) ?? 'sobre')
const highlights = ref<string[]>(
  Array.from({ length: MAX_HIGHLIGHTS }, (_, i) => latest?.inputRefs.highlights?.[i] ?? ''),
)
const toneItems = CoverLetterTone.options.map((value) => ({
  value,
  label: coverLetterToneLabels[value],
}))
// Once a letter exists, the options of a new one fold away under the letter.
const optionsOpen = ref(!latest)

// --- Version shown ------------------------------------------------------------------

/** The version shown in the editor; manual edits are saved onto it. */
const current = shallowRef<Generation<'cover_letter'> | null>(latest ?? null)
const parts = ref<LetterParts>(splitLetter(latest?.output.paragraphs ?? []))

/** The letter as it will be stored: header and footer lines as their own paragraphs. */
const paragraphs = computed(() => joinLetter(parts.value))
// Compared in the same joined form, so splitting a stored salutation off its
// paragraph is not an unsaved change.
const savedParagraphs = computed(() =>
  joinLetter(splitLetter(current.value?.output.paragraphs ?? [])),
)
const dirty = computed(
  () => JSON.stringify(paragraphs.value) !== JSON.stringify(savedParagraphs.value),
)
const wordTarget = computed(
  () => coverLetterWordTargets[current.value ? letterTemplate(current.value) : template.value],
)

function show(letter: Generation<'cover_letter'>) {
  current.value = letter
  parts.value = splitLetter(letter.output.paragraphs)
}

watch(current, (letter) => emit('change', letter), { immediate: true })

function confirmDiscard() {
  return (
    !dirty.value || window.confirm('Tes modifications non enregistrées seront perdues. Continuer ?')
  )
}

/** A new version was saved by Claude: show it and refresh the version list. */
async function onNewVersion(letter: Generation<'cover_letter'>) {
  show(letter)
  await refreshLetters()
}

// --- Claude: new letter, one paragraph, corrections ----------------------------------

// One instance per action, so each streams into its own place.
const letterGen = useGeneration('cover_letter')
const paragraphGen = useGeneration('cover_letter')
const revisionGen = useGeneration('cover_letter')
const busy = computed(
  () => letterGen.pending.value || paragraphGen.pending.value || revisionGen.pending.value,
)
const revisionForm = useTemplateRef<{ reset: () => void }>('revisionForm')

/** Options of the version being changed: a rewrite or a correction keeps its template and tone. */
function currentOptions(letter: Generation<'cover_letter'>) {
  return {
    offerId: props.offerId,
    ...(props.applicationId && { applicationId: props.applicationId }),
    template: letterTemplate(letter),
    tone: (letter.inputRefs.tone as CoverLetterTone | undefined) ?? tone.value,
    highlights: letter.inputRefs.highlights ?? [],
  }
}

async function generate() {
  if (!confirmDiscard()) return
  const letter = await letterGen.start({
    offerId: props.offerId,
    ...(props.applicationId && { applicationId: props.applicationId }),
    template: template.value,
    tone: tone.value,
    highlights: highlights.value.map((h) => h.trim()).filter(Boolean),
  })
  if (!letter) return
  await onNewVersion(letter)
  optionsOpen.value = false
}

const rewritingIndex = ref<number | null>(null)
const rewriting = computed(() =>
  rewritingIndex.value === null
    ? null
    : { index: rewritingIndex.value, text: paragraphGen.text.value.trim() },
)

async function rewrite(bodyIndex: number) {
  const letter = current.value
  if (!letter || busy.value) return
  rewritingIndex.value = bodyIndex
  // The server counts every stored paragraph: the header lines come first.
  const index = parts.value.header.length + bodyIndex
  const result = await paragraphGen.start({
    ...currentOptions(letter),
    regenerateParagraph: { generationId: letter.id, index, paragraphs: paragraphs.value },
  })
  rewritingIndex.value = null
  if (!result) return
  // Only take the rewritten paragraph: the user may have edited others meanwhile.
  const kept = parts.value
  current.value = result
  const body = [...kept.body]
  body[bodyIndex] = result.output.paragraphs[index] ?? body[bodyIndex]!
  parts.value = { ...kept, body }
  await refreshLetters()
}

async function revise(instructions: string) {
  const letter = current.value
  if (!letter) return
  const result = await revisionGen.start({
    ...currentOptions(letter),
    revision: { generationId: letter.id, paragraphs: paragraphs.value, instructions },
  })
  if (!result) return
  await onNewVersion(result)
  revisionForm.value?.reset()
  toast.add({ title: 'Corrections appliquées', icon: 'i-lucide-check' })
}

function stop() {
  letterGen.abort()
  paragraphGen.abort()
  revisionGen.abort()
}

/** Live text while Claude writes a whole letter, split like a saved one. */
const streamingGen = computed(() => (revisionGen.pending.value ? revisionGen : letterGen))
const streamed = computed<Partial<CoverLetterOutput>>(() => ({
  paragraphs: streamingGen.value.text.value.split(/\n\s*\n/),
}))
const streaming = computed(() => letterGen.pending.value || revisionGen.pending.value)

const error = computed(
  () => letterGen.error.value ?? revisionGen.error.value ?? paragraphGen.error.value,
)

// --- Versions, copy, save --------------------------------------------------------------

function reopen(letter: Generation<'cover_letter'>) {
  if (confirmDiscard()) show(letter)
}

async function copy() {
  try {
    await navigator.clipboard.writeText(paragraphs.value.join('\n\n'))
    toast.add({ title: 'Lettre copiée', icon: 'i-lucide-copy' })
  } catch {
    toast.add({
      title: 'Impossible de copier la lettre.',
      color: 'error',
      icon: 'i-lucide-circle-alert',
    })
  }
}

const saving = ref(false)

async function save() {
  if (!current.value) return
  saving.value = true
  try {
    const letter = await $fetch<Generation<'cover_letter'>>(
      `/api/generations/${current.value.id}`,
      { method: 'PATCH', body: { paragraphs: paragraphs.value } },
    )
    show(letter)
    await refreshLetters()
    toast.add({ title: 'Modifications enregistrées', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    saving.value = false
  }
}

onBeforeRouteLeave(() => {
  if (!confirmDiscard()) return false
})

const heading = computed(() => `h${props.headingLevel}`)
const id = useId()
</script>

<template>
  <div class="space-y-8">
    <UAlert
      v-if="loadError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Impossible de charger les versions de la lettre."
      :description="apiErrorMessage(loadError)"
    />

    <!-- Options of a new letter: open until a letter exists, then folded. -->
    <UCollapsible v-model:open="optionsOpen" :disabled="!current" :unmount-on-hide="false">
      <UButton
        v-if="current"
        :label="optionsOpen ? 'Masquer les options' : 'Écrire une nouvelle lettre'"
        :icon="optionsOpen ? 'i-lucide-chevron-up' : 'i-lucide-pen-line'"
        color="neutral"
        variant="outline"
        :disabled="busy"
      />
      <template #content>
        <div class="space-y-5" :class="{ 'pt-5': current }">
          <LettersTemplatePicker v-model="template" :disabled="busy" />
          <URadioGroup
            v-model="tone"
            legend="Ton de la lettre"
            :items="toneItems"
            :disabled="busy"
            orientation="horizontal"
            variant="table"
            :ui="{ legend: 'mb-2 text-sm font-medium text-highlighted', item: 'flex-1' }"
          />
          <fieldset class="space-y-2">
            <legend class="mb-2 text-sm font-medium text-highlighted">
              Points à mettre en avant <span class="font-normal text-muted">(facultatif)</span>
            </legend>
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
                :disabled="busy"
                :placeholder="i === 1 ? 'Ex. : mon projet open source en Rust' : ''"
              />
            </UFormField>
          </fieldset>
          <UButton
            :label="current ? 'Générer une nouvelle lettre' : 'Générer la lettre'"
            icon="i-lucide-sparkles"
            size="lg"
            :loading="letterGen.pending.value"
            :disabled="busy && !letterGen.pending.value"
            class="w-full justify-center sm:w-auto"
            @click="generate"
          />
        </div>
      </template>
    </UCollapsible>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="error"
      :actions="
        error.includes('CV')
          ? [{ label: 'Aller à la page CV', to: '/cv', color: 'error', variant: 'outline' }]
          : undefined
      "
    />

    <!-- The letter: streamed while Claude writes it, then editable. -->
    <UCard v-if="streaming" aria-live="polite">
      <StreamingIndicator
        :text="
          revisionGen.pending.value ? 'Claude applique tes corrections…' : 'Claude écrit ta lettre…'
        "
        class="mb-5"
        @stop="stop"
      />
      <LettersView v-if="streamingGen.text.value.trim()" :output="streamed" />
      <div v-else class="space-y-2" aria-hidden="true">
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-11/12" />
        <USkeleton class="h-4 w-4/5" />
      </div>
    </UCard>

    <UCard v-else-if="current" :ui="{ footer: 'space-y-3' }">
      <LettersTextEditor
        v-model="parts"
        :word-target="wordTarget"
        :disabled="busy"
        :rewriting="rewriting"
        @rewrite="rewrite"
        @stop-rewrite="paragraphGen.abort()"
      />
      <template #footer>
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Enregistrer"
            icon="i-lucide-save"
            :loading="saving"
            :disabled="!dirty || busy"
            @click="save"
          />
          <UButton
            label="Copier"
            icon="i-lucide-copy"
            color="neutral"
            variant="outline"
            @click="copy"
          />
        </div>
        <LettersExportActions
          :paragraphs="paragraphs"
          :filename="filename"
          :generation-id="dirty ? null : current.id"
          :offer-id="offerId"
        />
        <p v-if="dirty" class="text-xs text-muted">
          Enregistre tes modifications pour imprimer ou télécharger le PDF de cette version.
        </p>
      </template>
    </UCard>

    <!-- Corrections asked to Claude in plain words. -->
    <section v-if="current" :aria-labelledby="`${id}-corrections`" class="space-y-3">
      <div class="space-y-1">
        <component
          :is="heading"
          :id="`${id}-corrections`"
          class="flex items-center gap-2 font-semibold text-highlighted"
        >
          <UIcon name="i-lucide-wand-sparkles" class="size-4 text-primary" />
          Corrections
        </component>
        <p class="text-sm text-muted">
          Dis à Claude ce qu'il faut changer : il garde le reste de la lettre tel quel, tes
          modifications comprises.
        </p>
      </div>
      <LettersRevisionForm
        ref="revisionForm"
        :pending="revisionGen.pending.value"
        :disabled="busy && !revisionGen.pending.value"
        @submit="revise"
      />
    </section>

    <!-- Versions -->
    <section v-if="letters.length" :aria-labelledby="`${id}-versions`" class="space-y-3">
      <component
        :is="heading"
        :id="`${id}-versions`"
        class="flex items-center gap-2 font-semibold text-highlighted"
      >
        <UIcon name="i-lucide-history" class="size-4 text-primary" />
        Versions
        <span class="text-sm font-normal text-muted">({{ letters.length }})</span>
      </component>
      <LettersVersionList
        :letters="letters"
        :current-id="current?.id ?? null"
        :busy="busy"
        @open="reopen"
      />
    </section>
  </div>
</template>
