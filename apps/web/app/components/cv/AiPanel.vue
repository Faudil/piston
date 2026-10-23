<script setup lang="ts">
import {
  cvAiActionLabels,
  cvAiActions,
  parseCvEditOutput,
  type CvContent,
  type CvEditBody,
  type CvEditProposal,
  type CvOperation,
  type JobOffer,
} from '@piston/shared'

/**
 * Everything Claude can do on the document: the instruction box, actions on
 * the whole CV, tailoring to an offer and applying the latest review. Every
 * request ends in a proposal reviewed operation by operation
 * (CvProposalReview); the parent applies what the user accepts.
 */
const props = defineProps<{
  documentId: string
  content: CvContent
  /** The offer the document is dedicated to, preselected for tailoring. */
  offerId: string | null
}>()
const emit = defineEmits<{
  apply: [
    payload: { operations: CvOperation[]; label: string; generationId: string; body: CvEditBody },
  ]
  /** « Dans une copie » was chosen: the parent duplicates the document for the offer. */
  tailorInCopy: [offerId: string]
}>()

const { start, reset, partial, generation, pending, error } = useGeneration('cv_edit')

/** The request being shown, to label the revision once its edits are applied. */
const current = ref<{ body: CvEditBody; label: string } | null>(null)

// While streaming, Claude's flat operations are converted like the server
// does, so only complete-enough, valid operations are shown.
const proposal = computed<CvEditProposal | undefined>(() =>
  pending.value ? (parseCvEditOutput(partial.value) ?? undefined) : generation.value?.output,
)

const panel = ref<HTMLElement | null>(null)

/** Starts a proposal. Also called by the « IA » menus of sections, items and bullets. */
async function run(body: Omit<CvEditBody, 'documentId'>, label: string) {
  const full = { ...body, documentId: props.documentId } as CvEditBody
  current.value = { body: full, label }
  await nextTick()
  panel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  await start(full)
}

defineExpose({ run })

// --- Instruction --------------------------------------------------------------------

const instruction = ref('')
const EXAMPLES = [
  'Mets en avant le management d’équipe',
  'Rends mon accroche plus percutante',
  'Ajoute mon stage chez … en 2023 : …',
]

function sendInstruction() {
  const text = instruction.value.trim()
  if (text.length < 3) return
  run(
    { mode: 'instruction', instruction: text },
    `IA : « ${text.length > 60 ? `${text.slice(0, 57)}…` : text} »`,
  )
}

// --- Offers --------------------------------------------------------------------------

const { data: offers } = await useFetch<JobOffer[]>('/api/offers', {
  default: () => [],
  lazy: true,
})
const offerId = ref<string | undefined>(props.offerId ?? undefined)
const offerItems = computed(() =>
  offers.value.map((offer) => ({
    value: offer.id,
    label: [offer.title, offer.company].filter(Boolean).join(' — '),
  })),
)
const selectedOffer = computed(() => offers.value.find((offer) => offer.id === offerId.value))

function tailor() {
  if (!selectedOffer.value) return
  run(
    { mode: 'tailor', offerId: selectedOffer.value.id },
    `IA : adapté à « ${selectedOffer.value.title} »`,
  )
}

// --- Applying -----------------------------------------------------------------------

function apply(operations: CvOperation[]) {
  if (!generation.value || !current.value) return
  emit('apply', {
    operations,
    label: current.value.label,
    generationId: generation.value.id,
    body: current.value.body,
  })
  reset()
  current.value = null
}

function discard() {
  reset()
  current.value = null
}
</script>

<template>
  <div class="space-y-8">
    <section aria-labelledby="ai-instruction" class="space-y-3">
      <h3 id="ai-instruction" class="flex items-center gap-2 font-semibold text-highlighted">
        <UIcon name="i-lucide-message-square-text" class="size-5 text-primary" />
        Demande à Claude
      </h3>
      <form class="space-y-3" @submit.prevent="sendInstruction">
        <UFormField
          label="Ce que tu veux changer"
          :hint="`${instruction.length}/1000`"
          help="Claude propose des modifications que tu acceptes une par une. Il n’ajoute que les faits que tu lui donnes."
        >
          <UTextarea
            v-model="instruction"
            class="w-full"
            :rows="3"
            autoresize
            :maxlength="1000"
            placeholder="Ex. : Ajoute mon stage chez Agence X de mars à août 2023, j’y gérais les réseaux sociaux"
            @keydown.meta.enter="sendInstruction"
            @keydown.ctrl.enter="sendInstruction"
          />
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="example in EXAMPLES"
            :key="example"
            :label="example"
            size="xs"
            color="neutral"
            variant="soft"
            @click="instruction = example"
          />
        </div>
        <UButton
          type="submit"
          label="Proposer des modifications"
          icon="i-lucide-sparkles"
          :loading="pending && current?.body.mode === 'instruction'"
          :disabled="pending || instruction.trim().length < 3"
        />
      </form>
    </section>

    <section aria-labelledby="ai-actions" class="space-y-3">
      <h3 id="ai-actions" class="flex items-center gap-2 font-semibold text-highlighted">
        <UIcon name="i-lucide-wand-sparkles" class="size-5 text-primary" />
        Sur tout le CV
      </h3>
      <p class="text-sm text-muted">
        Ces actions existent aussi pour une section, une expérience ou une puce, dans leur menu
        <UIcon name="i-lucide-sparkles" class="inline size-3.5 align-[-2px]" aria-label="IA" />.
      </p>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <UButton
          v-for="action in cvAiActions"
          :key="action"
          :label="cvAiActionLabels[action].label"
          :icon="cvAiActionLabels[action].icon"
          color="neutral"
          variant="outline"
          :disabled="pending"
          @click="
            run(
              { mode: 'action', action, scope: {} },
              `IA : ${cvAiActionLabels[action].label.toLowerCase()} (tout le CV)`,
            )
          "
        />
      </div>
    </section>

    <section aria-labelledby="ai-offer" class="space-y-3">
      <h3 id="ai-offer" class="flex items-center gap-2 font-semibold text-highlighted">
        <UIcon name="i-lucide-target" class="size-5 text-primary" />
        Adapter à une offre
      </h3>
      <template v-if="offers.length">
        <UFormField
          label="Offre"
          help="Claude réordonne et reformule ; il n’ajoute un mot-clé que si ton CV le justifie."
        >
          <USelect
            v-model="offerId"
            :items="offerItems"
            class="w-full"
            placeholder="Choisis une offre"
          />
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Adapter ce CV"
            icon="i-lucide-target"
            :disabled="!selectedOffer || pending"
            :loading="pending && current?.body.mode === 'tailor'"
            @click="tailor"
          />
          <UButton
            label="Dans une copie dédiée"
            icon="i-lucide-copy"
            color="neutral"
            variant="outline"
            :disabled="!selectedOffer || pending"
            @click="selectedOffer && emit('tailorInCopy', selectedOffer.id)"
          />
        </div>
      </template>
      <p v-else class="text-sm text-muted">
        Ajoute d’abord une offre sur la page
        <NuxtLink to="/offres" class="text-primary underline">Offres</NuxtLink>.
      </p>
    </section>

    <section aria-labelledby="ai-review" class="space-y-3">
      <h3 id="ai-review" class="flex items-center gap-2 font-semibold text-highlighted">
        <UIcon name="i-lucide-file-search" class="size-5 text-primary" />
        Appliquer les conseils de la critique
      </h3>
      <p class="text-sm text-muted">
        La dernière critique de ce profil (points à corriger, réécriture, vérifications ATS) devient
        une liste de modifications.
      </p>
      <UButton
        label="Transformer la critique en modifications"
        icon="i-lucide-list-checks"
        color="neutral"
        variant="outline"
        :disabled="pending"
        :loading="pending && current?.body.mode === 'review'"
        @click="run({ mode: 'review' }, 'IA : conseils de la critique')"
      />
    </section>

    <section
      v-if="current || error"
      ref="panel"
      aria-labelledby="ai-proposal"
      class="scroll-mt-6 space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 id="ai-proposal" class="font-semibold text-highlighted">Proposition de Claude</h3>
        <StreamingIndicator v-if="pending" text="Claude prépare ses propositions…" />
      </div>
      <p v-if="current" class="text-sm text-muted">{{ current.label.replace(/^IA : /, '') }}</p>
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="error"
      />
      <CvProposalReview
        v-if="proposal"
        :proposal="proposal"
        :content="content"
        :pending="pending"
        @apply="apply"
        @discard="discard"
      />
      <ResultSkeleton v-else-if="pending" />
    </section>
  </div>
</template>
