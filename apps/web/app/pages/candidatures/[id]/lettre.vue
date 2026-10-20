<script setup lang="ts">
import {
  coverLetterToneLabels,
  coverLetterWordTargets,
  CoverLetterTone,
  type Application,
  type CoverLetterOutput,
  type CoverLetterTemplate,
  type Generation,
  type Resume,
} from '@piston/shared'

/**
 * Cover letter of one application: choose a template, a tone and points to
 * highlight, generate, edit, ask Claude for corrections, and go back to any
 * previous version. Every generation is a new version (history is
 * append-only); manual edits are saved onto the version being shown.
 */
const route = useRoute()
const toast = useToast()
const applicationId = route.params.id as string

const { data: application, error: applicationError } = await useFetch<Application>(
  `/api/applications/${applicationId}`,
)
const { data: letters, refresh: refreshLetters } = await useFetch<Generation<'cover_letter'>[]>(
  `/api/applications/${applicationId}/letters`,
  { default: () => [] },
)
// Only used to point to the CV page when generation fails for lack of a resume.
const { data: resumes } = await useFetch<Resume[]>('/api/resumes', { default: () => [] })

useSeoMeta({ title: () => `Lettre — ${application.value?.offer.title ?? 'Candidature'}` })

// --- Options ----------------------------------------------------------------

const MAX_HIGHLIGHTS = 3
const latest = letters.value[0]

const template = ref<CoverLetterTemplate>(
  (latest?.inputRefs.template as CoverLetterTemplate) ?? 'classique',
)
const tone = ref<CoverLetterTone>((latest?.inputRefs.tone as CoverLetterTone) ?? 'sobre')
const highlights = ref<string[]>(
  Array.from({ length: MAX_HIGHLIGHTS }, (_, i) => latest?.inputRefs.highlights?.[i] ?? ''),
)
const toneItems = CoverLetterTone.options.map((value) => ({
  value,
  label: coverLetterToneLabels[value],
}))

// --- Current letter ---------------------------------------------------------

/** The version shown in the editor; manual edits are saved onto it. */
const current = shallowRef<Generation<'cover_letter'> | null>(latest ?? null)
const paragraphs = ref<string[]>([...(latest?.output.paragraphs ?? [])])
const dirty = computed(
  () => JSON.stringify(paragraphs.value) !== JSON.stringify(current.value?.output.paragraphs ?? []),
)
const wordTarget = computed(
  () =>
    coverLetterWordTargets[
      (current.value?.inputRefs.template as CoverLetterTemplate) ?? 'classique'
    ],
)

/** "Acme Corp" → "acme-corp", for file names. */
const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function show(letter: Generation<'cover_letter'>) {
  current.value = letter
  paragraphs.value = [...letter.output.paragraphs]
}

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

// --- Generation and corrections ----------------------------------------------

// Two instances so the streamed text of each action is shown in its own place.
const letterGen = useGeneration('cover_letter')
const revisionGen = useGeneration('cover_letter')
const busy = computed(() => letterGen.pending.value || revisionGen.pending.value)
const revisionForm = useTemplateRef<{ reset: () => void }>('revisionForm')

async function generate() {
  if (!application.value || !confirmDiscard()) return
  const letter = await letterGen.start({
    offerId: application.value.jobOfferId,
    applicationId,
    template: template.value,
    tone: tone.value,
    highlights: highlights.value.map((h) => h.trim()).filter(Boolean),
  })
  if (letter) await onNewVersion(letter)
}

async function revise(instructions: string) {
  if (!application.value || !current.value) return
  // The revision keeps the structure and tone of the version being corrected.
  const refs = current.value.inputRefs
  const letter = await revisionGen.start({
    offerId: application.value.jobOfferId,
    applicationId,
    template: refs.template ?? 'classique',
    tone: refs.tone ?? tone.value,
    highlights: refs.highlights ?? [],
    revision: { generationId: current.value.id, paragraphs: paragraphs.value, instructions },
  })
  if (!letter) return
  await onNewVersion(letter)
  revisionForm.value?.reset()
  toast.add({ title: 'Corrections appliquées', icon: 'i-lucide-check' })
}

function reopen(letter: Generation<'cover_letter'>) {
  if (confirmDiscard()) show(letter)
}

/** Live text while Claude writes, split like the saved letter. */
const streamed = computed<Partial<CoverLetterOutput>>(() => ({
  paragraphs: (revisionGen.pending.value ? revisionGen.text : letterGen.text).value.split(
    /\n\s*\n/,
  ),
}))

const error = computed(() => letterGen.error.value ?? revisionGen.error.value)

// --- Save -------------------------------------------------------------------

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
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    saving.value = false
  }
}

onBeforeRouteLeave(() => {
  if (!confirmDiscard()) return false
})
</script>

<template>
  <AppPage
    v-if="applicationError || !application"
    title="Candidature introuvable"
    :back="{ to: '/candidatures', label: 'Candidatures' }"
    width="narrow"
  >
    <UAlert
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Cette candidature n'existe pas ou n'est pas la tienne."
    />
  </AppPage>

  <AppPage
    v-else
    :title="`Lettre de motivation`"
    :back="{ to: '/candidatures', label: 'Candidatures' }"
    width="narrow"
  >
    <template #description>
      Pour <span class="font-medium text-highlighted">{{ application.offer.title }}</span>
      <template v-if="application.offer.company"> chez {{ application.offer.company }}</template>
    </template>
    <template #actions>
      <UButton
        :to="`/offres/${application.offer.id}`"
        label="Voir l'offre"
        icon="i-lucide-briefcase"
        color="neutral"
        variant="outline"
      />
    </template>

    <div class="space-y-10">
      <!-- Options -->
      <section aria-labelledby="letter-options" class="space-y-5">
        <AppSectionHeading
          id="letter-options"
          title="Ta lettre"
          icon="i-lucide-sliders-horizontal"
          description="Les notes de ta candidature (nom du recruteur, recommandation…) sont prises en compte."
        />
        <LetterTemplatePicker v-model="template" :disabled="busy" />
        <URadioGroup
          v-model="tone"
          legend="Ton de la lettre"
          :items="toneItems"
          :disabled="busy"
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
              :disabled="busy"
              :placeholder="i === 1 ? 'Ex. : mon projet open source en Rust' : ''"
            />
          </UFormField>
        </fieldset>
        <UButton
          :label="current ? 'Générer une nouvelle lettre' : 'Générer la lettre'"
          icon="i-lucide-pen-line"
          size="lg"
          :loading="letterGen.pending.value"
          :disabled="revisionGen.pending.value"
          class="w-full justify-center sm:w-auto"
          @click="generate"
        />
      </section>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="error"
        :actions="
          resumes.length
            ? undefined
            : [{ label: 'Ajouter mon CV', to: '/cv', color: 'error', variant: 'outline' }]
        "
      />

      <!-- Letter -->
      <section v-if="busy || current" aria-labelledby="letter-text" class="space-y-4">
        <AppSectionHeading id="letter-text" title="Lettre" icon="i-lucide-file-text" />
        <UCard v-if="busy" aria-live="polite">
          <StreamingIndicator
            :text="revisionGen.pending.value ? 'Claude applique tes corrections…' : 'Claude écrit…'"
            class="mb-4"
          />
          <CoverLetterView :output="streamed" />
        </UCard>
        <UCard v-else>
          <ApplicationLetterEditor
            v-model="paragraphs"
            :word-target="wordTarget"
            :dirty="dirty"
            :saving="saving"
            :filename="`lettre-${slug(application?.offer.company || application?.offer.title || 'candidature')}`"
            :generation-id="current?.id"
            @save="save"
          />
        </UCard>
      </section>

      <!-- Corrections -->
      <section v-if="current" aria-labelledby="letter-corrections">
        <AppSectionHeading
          id="letter-corrections"
          title="Corrections"
          icon="i-lucide-wand-sparkles"
          description="Dis à Claude ce qu'il faut changer : il garde le reste de la lettre tel quel, tes modifications comprises."
        />
        <LetterRevisionForm
          ref="revisionForm"
          :pending="revisionGen.pending.value"
          :disabled="letterGen.pending.value"
          @submit="revise"
        />
      </section>

      <!-- Versions -->
      <section v-if="letters.length" aria-labelledby="letter-versions">
        <AppSectionHeading
          id="letter-versions"
          title="Versions"
          icon="i-lucide-history"
          :description="`${letters.length} version${letters.length > 1 ? 's' : ''} pour cette candidature.`"
        />
        <LetterVersionList
          :letters="letters"
          :current-id="current?.id ?? null"
          :busy="busy"
          @open="reopen"
        />
      </section>
    </div>
  </AppPage>
</template>
