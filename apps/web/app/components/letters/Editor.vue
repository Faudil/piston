<script setup lang="ts">
import {
  coverLetterToneLabels,
  coverLetterWordTargets,
  CoverLetterTone,
  type CoverLetterOutput,
  type CoverLetterTemplate,
  type Generation,
  type LetterSummary,
} from '@piston/shared'

/**
 * The cover letter of an offer, used by the offer page and by the letter page
 * of its application: choose a template, a tone and points to highlight,
 * generate, edit (the body paragraph by paragraph, the salutation and the
 * closing inline), ask Claude to rework the picked paragraphs or the whole
 * letter, go back to a previous version, copy, save and export.
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
const customStructure = ref(latest?.inputRefs.customStructure ?? '')
const tone = ref<CoverLetterTone>((latest?.inputRefs.tone as CoverLetterTone) ?? 'sobre')
const highlights = ref<string[]>(
  Array.from({ length: MAX_HIGHLIGHTS }, (_, i) => latest?.inputRefs.highlights?.[i] ?? ''),
)
const toneItems = CoverLetterTone.options.map((value) => ({
  value,
  label: coverLetterToneLabels[value],
}))

// A previous letter as a model: one per other offer, its latest version.
const { data: otherLetters } = useFetch<LetterSummary[]>('/api/letters', {
  lazy: true,
  server: false,
  default: () => [],
  transform: (all) => all.filter((letter) => letter.offer.id !== props.offerId),
})
const modelLetterId = ref<string | null>(null)
const modelLetter = computed(() =>
  otherLetters.value.find((letter) => letter.generationId === modelLetterId.value),
)
// The model's tone is the likely wish; it can still be changed.
watch(modelLetter, (letter) => {
  if (letter?.tone && letter.tone in coverLetterToneLabels)
    tone.value = letter.tone as CoverLetterTone
})

// Once a letter exists, the options of a new one fold away under the letter.
const optionsOpen = ref(!latest)

// --- Version shown ------------------------------------------------------------------

/** Body paragraphs picked for Claude to rework. None: corrections cover the whole letter. */
const selectedParagraphs = ref<number[]>([])
/** What Claude replaced in the last rewrite, by body paragraph: it can be put back. */
const replacedParagraphs = ref(new Map<number, string>())
const rewrittenParagraphs = computed(() => new Set(replacedParagraphs.value.keys()))
/** The version shown in the editor; manual edits are saved onto it. */
const current = shallowRef<Generation<'cover_letter'> | null>(latest ?? null)
const parts = ref<LetterParts>(latest ? letterParts(latest) : splitLetter([]))

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
  parts.value = letterParts(letter)
  selectedParagraphs.value = []
  replacedParagraphs.value = new Map()
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

// --- Claude: new letter, some paragraphs, corrections ----------------------------------

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
    ...(modelLetterId.value && { modelLetterId: modelLetterId.value }),
    ...(template.value === 'personnalise' &&
      !modelLetterId.value &&
      customStructure.value.trim() && { customStructure: customStructure.value.trim() }),
  })
  if (!letter) return
  await onNewVersion(letter)
  optionsOpen.value = false
}

/** An empty paragraph has nothing to go over. */
const pickedParagraphs = computed(() =>
  selectedParagraphs.value.filter((i) => parts.value.body[i]?.trim()),
)
const hasText = computed(() => parts.value.body.some((paragraph) => paragraph.trim()))
const rewritingIndexes = ref<number[]>([])
const writingManually = ref(false)
/** Starts a letter the user writes themselves: Claude only comes in when asked. */
async function writeManually() {
  if (!confirmDiscard()) return
  writingManually.value = true
  try {
    const letter = await $fetch<Generation<'cover_letter'>>(
      `/api/offers/${props.offerId}/letters`,
      {
        method: 'POST',
        body: props.applicationId ? { applicationId: props.applicationId } : {},
      },
    )
    await onNewVersion(letter)
    optionsOpen.value = false
    await nextTick()
    document.getElementById('letter-paragraph-0')?.focus()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    writingManually.value = false
  }
}

const rewriting = computed(() => {
  if (rewritingIndexes.value.length === 0) return null
  // Claude answers one paragraph per blank line, in the order of the letter.
  // A single rewrite stays whole, like the answer the server merges.
  const answer = paragraphGen.text.value.trim()
  const texts = rewritingIndexes.value.length === 1 ? [answer] : answer.split(/\n\s*\n/)
  return new Map(rewritingIndexes.value.map((index, i) => [index, texts[i] ?? '']))
})

/** Rewrites the picked paragraphs; `instructions` is optional. */
async function rewrite(instructions: string) {
  const letter = current.value
  if (!letter || busy.value) return
  const bodyIndexes = pickedParagraphs.value
  rewritingIndexes.value = bodyIndexes
  // The server counts every stored paragraph: the header lines come first, and
  // paragraphs still empty are not stored.
  const indexes = bodyIndexes.map(
    (i) => parts.value.header.length + parts.value.body.slice(0, i).filter((p) => p.trim()).length,
  )
  const result = await paragraphGen.start({
    ...currentOptions(letter),
    rewriteParagraphs: {
      generationId: letter.id,
      indexes,
      paragraphs: paragraphs.value,
      ...(instructions && { instructions }),
    },
  })
  rewritingIndexes.value = []
  if (!result) return
  // Only take the rewritten paragraphs: the user may have edited others meanwhile.
  const kept = parts.value
  current.value = result
  const body = [...kept.body]
  const replaced = new Map<number, string>()
  bodyIndexes.forEach((bodyIndex, i) => {
    replaced.set(bodyIndex, body[bodyIndex]!)
    body[bodyIndex] = result.output.paragraphs[indexes[i]!] ?? body[bodyIndex]!
  })
  parts.value = { ...kept, body }
  replacedParagraphs.value = replaced
  selectedParagraphs.value = []
  revisionForm.value?.reset()
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

/** Puts back the text Claude replaced. It becomes an unsaved edit of the new version. */
function undoRewrite(bodyIndex: number) {
  const previous = replacedParagraphs.value.get(bodyIndex)
  if (previous === undefined) return
  const body = [...parts.value.body]
  body[bodyIndex] = previous
  parts.value = { ...parts.value, body }
  forgetRewrite(bodyIndex)
}

function forgetRewrite(bodyIndex: number) {
  if (!replacedParagraphs.value.has(bodyIndex)) return
  const replaced = new Map(replacedParagraphs.value)
  replaced.delete(bodyIndex)
  replacedParagraphs.value = replaced
}

function rework(instructions: string) {
  replacedParagraphs.value = new Map()
  return pickedParagraphs.value.length > 0 ? rewrite(instructions) : revise(instructions)
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
          <LettersModelLetterSelect
            v-if="otherLetters.length"
            v-model="modelLetterId"
            :letters="otherLetters"
            :disabled="busy"
          />
          <!-- The model decides the structure of the letter. -->
          <LettersTemplatePicker
            v-if="!modelLetter"
            v-model="template"
            v-model:custom-structure="customStructure"
            :disabled="busy"
          />
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
          <UButton
            label="Écrire moi-même"
            icon="i-lucide-pen-line"
            size="lg"
            color="neutral"
            variant="outline"
            :loading="writingManually"
            :disabled="busy"
            class="w-full justify-center sm:ml-2 sm:w-auto"
            @click="writeManually"
          />
          <AppUsageNotice />
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

    <!-- The letter and its composer: the composer stays in view while the letter scrolls. -->
    <div class="space-y-3">
      <!-- The letter: streamed while Claude writes it, then editable. -->
      <UCard v-if="streaming" aria-live="polite">
        <StreamingIndicator
          :text="
            revisionGen.pending.value
              ? 'Claude applique tes corrections…'
              : 'Claude écrit ta lettre…'
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
          v-model:selected="selectedParagraphs"
          :word-target="wordTarget"
          :disabled="busy"
          :rewriting="rewriting"
          :rewritten="rewrittenParagraphs"
          @undo="undoRewrite"
          @edited="forgetRewrite"
          @reshaped="replacedParagraphs = new Map()"
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

      <section
        v-if="current"
        aria-label="Retravailler avec Claude"
        class="sticky bottom-[calc(var(--app-bottom-nav)+0.5rem)] z-20"
      >
        <LettersRevisionForm
          ref="revisionForm"
          :pending="revisionGen.pending.value || paragraphGen.pending.value"
          :disabled="
            (busy && !revisionGen.pending.value && !paragraphGen.pending.value) || !hasText
          "
          :selected="pickedParagraphs.map((i) => i + 1)"
          @submit="rework"
          @clear-selection="selectedParagraphs = []"
          @select-all="selectedParagraphs = parts.body.flatMap((p, i) => (p.trim() ? [i] : []))"
          @stop="stop"
        />
      </section>
    </div>

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
