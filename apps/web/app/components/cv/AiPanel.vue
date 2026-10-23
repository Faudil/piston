<script setup lang="ts">
import {
  cvAiActionLabels,
  cvAiActions,
  parseCvEditOutput,
  type CvContent,
  type CvDesign,
  type CvEditBody,
  type CvEditProposal,
  type CvTemplateId,
  type CvOperation,
  type JobOffer,
} from '@piston/shared'

/**
 * Everything Claude can do on the document: the coach (live checks, latest
 * review, one-click corrections), the instruction box and quick style
 * requests, writing help, actions on the whole CV, the one-page version, the
 * English copy, tailoring to an offer and applying the latest review. Every
 * request ends in a proposal reviewed operation by operation
 * (CvProposalReview); the parent applies what the user accepts. Design
 * operations (template, colors, fonts...) are applied by the parent with
 * `applyCvOperationsToDocument`.
 */
const props = defineProps<{
  documentId: string
  content: CvContent
  /** The offer the document is dedicated to, preselected for tailoring. */
  offerId: string | null
  /** The design and template: for the coach's checks and to show design changes as diffs. */
  design?: CvDesign
  templateId?: CvTemplateId
  /** The page count of the preview, when known. */
  pageCount?: number
  /** Called before the document is copied (« Traduire en anglais »), e.g. to save pending edits. */
  beforeCopy?: () => Promise<void>
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
async function run(body: CvEditRequest, label: string) {
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
  'Rends-le plus sobre pour une banque',
  'Plus créatif, je postule en agence',
]

/** Quick design requests, sent as instructions: Claude answers with design operations. */
const STYLES = [
  {
    label: 'Plus sobre',
    icon: 'i-lucide-minus',
    instruction:
      'Rends le design de ce CV plus sobre et classique : une colonne, des couleurs discrètes, sans icônes ni éléments décoratifs.',
  },
  {
    label: 'Plus créatif',
    icon: 'i-lucide-palette',
    instruction:
      'Rends le design de ce CV plus créatif et plus marqué (couleur, polices, mise en page), pour une candidature dans une agence ou un secteur créatif.',
  },
  {
    label: 'Lisible par les ATS',
    icon: 'i-lucide-scan-text',
    instruction:
      'Adapte le design de ce CV pour les portails d’emploi et les logiciels de recrutement (ATS) : lecture optimale, une colonne, sans icônes.',
  },
]

function sendStyle(style: (typeof STYLES)[number]) {
  run(
    { mode: 'instruction', instruction: style.instruction },
    `IA : design « ${style.label.toLowerCase()} »`,
  )
}

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

// --- Questions (« Compléter cette section ») --------------------------------------------

/** The questions Claude asked, while the user has not answered them yet. */
const questions = computed(() =>
  !pending.value && current.value?.body.mode === 'complete' && !current.value.body.answers
    ? generation.value?.output.questions
    : undefined,
)

function answerQuestions(answers: Array<{ question: string; answer: string }>) {
  if (!current.value) return
  run({ ...current.value.body, answers } as CvEditRequest, current.value.label)
}

// --- Writing help, one page, English copy ---------------------------------------------

const router = useRouter()
const route = useRoute()
const toast = useToast()
const copying = ref(false)

/** The translation goes to a new document: the copy is created now, translated by a reviewed proposal. */
async function translateInCopy() {
  copying.value = true
  try {
    await props.beforeCopy?.()
    const copy = await $fetch<{ id: string }>(`/api/cv-documents/${props.documentId}/translate`, {
      method: 'POST',
    })
    await router.push({ path: `/cv/editeur/${copy.id}`, query: { ia: 'traduire' } })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    copying.value = false
  }
}

// Opened with ?ia=traduire (the English copy just made): ask for the translation once.
const requestEdit = inject(CV_AI_REQUEST, null)
onMounted(async () => {
  if (route.query.ia !== 'traduire') return
  await router.replace({ query: {} })
  await nextTick()
  const label = 'IA : traduction en anglais'
  if (requestEdit) requestEdit({ mode: 'translate' }, label)
  else void run({ mode: 'translate' }, label)
})

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
    <CvAiCoachPanel
      :document-id="documentId"
      :content="content"
      :design="design"
      :template-id="templateId"
      :page-count="pageCount"
      :disabled="pending"
      @fix="run"
    />

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

    <section aria-labelledby="ai-style" class="space-y-3">
      <h3 id="ai-style" class="flex items-center gap-2 font-semibold text-highlighted">
        <UIcon name="i-lucide-palette" class="size-5 text-primary" />
        Style du CV
      </h3>
      <p class="text-sm text-muted">
        Claude propose un modèle, des couleurs ou des polices ; tu vois le changement avant de
        l’accepter. Dis aussi le secteur dans ta demande ci-dessus (« pour une banque »).
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="style in STYLES"
          :key="style.label"
          :label="style.label"
          :icon="style.icon"
          color="neutral"
          variant="outline"
          :disabled="pending"
          @click="sendStyle(style)"
        />
      </div>
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
          v-for="action in cvAiActions.filter((action) => action !== 'translate_en')"
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
        <UButton
          label="Générer l’accroche"
          icon="i-lucide-text-cursor-input"
          color="neutral"
          variant="outline"
          :disabled="pending"
          @click="run({ mode: 'summary' }, 'IA : accroche générée')"
        />
        <UButton
          label="Version une page"
          icon="i-lucide-file-minus"
          color="neutral"
          variant="outline"
          :disabled="pending"
          @click="run({ mode: 'one_page', pageCount }, 'IA : version une page')"
        />
        <UButton
          label="Traduire en anglais"
          icon="i-lucide-languages"
          color="neutral"
          variant="outline"
          :loading="copying"
          :disabled="pending || copying"
          @click="translateInCopy"
        />
      </div>
      <p class="text-sm text-muted">
        « Traduire en anglais » crée une copie de ce CV (même modèle, titres en anglais) et propose
        la traduction à relire : ton CV d’origine ne change pas.
      </p>
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
      <CvAiQuestionsForm
        v-if="questions?.length && generation"
        :key="generation.id"
        :questions="questions"
        :summary="generation.output.summary"
        :pending="pending"
        @submit="answerQuestions"
        @cancel="discard"
      />
      <CvProposalReview
        v-else-if="proposal"
        :proposal="proposal"
        :content="content"
        :design="design"
        :template-id="templateId"
        :pending="pending"
        @apply="apply"
        @discard="discard"
      />
      <ResultSkeleton v-else-if="pending" />
    </section>
  </div>
</template>
