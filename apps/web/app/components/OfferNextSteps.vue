<script setup lang="ts">
import type { Application, CvDocumentSummary, JobOffer, ResumeProfile } from '@piston/shared'

/**
 * « Prochaine étape » for one offer: the main flow (analysis → letter →
 * application → tailored CV) as a short checklist, with the action of the
 * first step not done yet. Once the CV is tailored, links to it and to the
 * letter as a PDF in the same design.
 *
 * The parent says what it knows (analysis, letter, application); the CV
 * built for the offer (`cv_documents.offer_id`) is looked up here.
 */
const props = withDefaults(
  defineProps<{
    offer: Pick<JobOffer, 'id' | 'profileId'>
    application: Application | null
    /** Leave undefined to hide the analysis step (pages without one). */
    hasAnalysis?: boolean
    /** The letter shown, if any: the matching PDF uses it. */
    letterId: string | null
    /** Where « Écrire la lettre » leads; without it the parent handles `write-letter`. */
    letterTo?: string
    analyzing?: boolean
    tracking?: boolean
  }>(),
  // Vue turns a missing boolean prop into `false`: keep « not given » apart.
  { hasAnalysis: undefined, letterTo: undefined },
)
const emit = defineEmits<{ analyze: []; writeLetter: []; track: [] }>()

// Not awaited (useResumeProfiles is): this card also opens inside a slideover.
// Same key as useResumeProfiles, so the profiles are fetched once.
const { data: profiles } = useFetch<ResumeProfile[]>('/api/profiles', {
  key: 'resume-profiles',
  default: () => [],
})
const defaultProfile = computed(() => profiles.value.find((profile) => profile.isDefault))
const { data: documents, status } = useFetch<CvDocumentSummary[]>('/api/cv-documents', {
  server: false,
  lazy: true,
  default: () => [],
})
/** The most recent CV made for this offer. */
const tailored = computed(
  () =>
    documents.value
      .filter((document) => document.offer?.id === props.offer.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0],
)
const { tailor, pending: tailoring } = useTailorCv()

type StepKey = 'analysis' | 'letter' | 'application' | 'cv'
const steps = computed(() => {
  const all: { key: StepKey; label: string; done: boolean }[] = [
    { key: 'analysis', label: 'Analyse', done: Boolean(props.hasAnalysis) },
    { key: 'letter', label: 'Lettre', done: Boolean(props.letterId) },
    { key: 'application', label: 'Candidature', done: Boolean(props.application) },
    { key: 'cv', label: 'CV adapté', done: Boolean(tailored.value) },
  ]
  return props.hasAnalysis === undefined ? all.slice(1) : all
})
const next = computed(() => steps.value.find((step) => !step.done)?.key ?? 'done')

const letterPdf = computed(() =>
  props.letterId && tailored.value
    ? `/api/generations/${props.letterId}/letter-pdf?download=1&cvDocumentId=${tailored.value.id}`
    : null,
)

const content = computed(() => {
  switch (next.value) {
    case 'analysis':
      return {
        icon: 'i-lucide-scan-search',
        title: 'Analyse l’offre',
        text: 'Ton score de correspondance, tes atouts et ce qui manque, avant d’écrire ta lettre.',
      }
    case 'letter':
      return {
        icon: 'i-lucide-pen-line',
        title: 'Écris ta lettre de motivation',
        text: 'Claude part de l’offre et de ton CV ; tu choisis le modèle, le ton et ce qu’il faut mettre en avant.',
      }
    case 'application':
      return {
        icon: 'i-lucide-kanban',
        title: 'Ajoute l’offre à tes candidatures',
        text: 'Pour suivre l’envoi, les relances et les entretiens sur ton tableau.',
      }
    case 'cv':
      return {
        icon: 'i-lucide-file-user',
        title: 'Adapte ton CV à cette offre',
        text: 'Claude en fait une copie ajustée à l’offre, et tu valides chaque modification. Ton CV d’origine ne change pas.',
      }
    default:
      return {
        icon: 'i-lucide-send',
        title:
          props.application?.status === 'to_send'
            ? 'Tout est prêt : envoie ta candidature'
            : 'Ta candidature est complète',
        text:
          props.application?.status === 'to_send'
            ? 'Joins ta lettre et ton CV adapté, puis passe la carte dans « Envoyée » sur ton tableau.'
            : 'Retrouve ton CV adapté et ta lettre assortie ici quand tu en as besoin.',
      }
  }
})
</script>

<template>
  <section
    aria-labelledby="offer-next-step"
    class="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5"
  >
    <div class="flex items-start gap-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10">
        <UIcon :name="content.icon" class="size-5 text-primary" />
      </span>
      <div class="min-w-0 space-y-1">
        <p class="text-xs font-semibold tracking-wider text-primary uppercase">Prochaine étape</p>
        <h2 id="offer-next-step" class="font-semibold text-balance text-highlighted">
          {{ content.title }}
        </h2>
        <p class="text-sm text-pretty text-muted">{{ content.text }}</p>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <UButton
        v-if="next === 'analysis'"
        label="Analyser l’offre"
        icon="i-lucide-sparkles"
        :loading="analyzing"
        @click="emit('analyze')"
      />
      <UButton
        v-else-if="next === 'letter'"
        label="Écrire la lettre"
        icon="i-lucide-pen-line"
        :to="letterTo"
        @click="letterTo ? undefined : emit('writeLetter')"
      />
      <UButton
        v-else-if="next === 'application'"
        label="Ajouter aux candidatures"
        icon="i-lucide-kanban"
        :loading="tracking"
        @click="emit('track')"
      />
      <UButton
        v-else-if="next === 'cv'"
        label="Adapter mon CV à cette offre"
        icon="i-lucide-wand-sparkles"
        :loading="tailoring"
        :disabled="status === 'pending'"
        @click="tailor(offer, documents, defaultProfile?.id)"
      />
      <template v-if="tailored">
        <UButton
          :to="`/cv/editeur/${tailored.id}`"
          label="Ouvrir mon CV adapté"
          icon="i-lucide-file-pen-line"
          :color="next === 'done' ? 'primary' : 'neutral'"
          :variant="next === 'done' ? 'solid' : 'outline'"
        />
        <UButton
          v-if="letterPdf"
          :href="letterPdf"
          external
          label="Lettre en PDF assortie"
          icon="i-lucide-file-heart"
          color="neutral"
          variant="outline"
        />
      </template>
      <UButton
        v-if="next === 'done' && application"
        to="/candidatures"
        label="Voir le tableau"
        icon="i-lucide-kanban"
        color="neutral"
        variant="ghost"
      />
    </div>

    <ol class="flex flex-wrap gap-x-4 gap-y-2 border-t border-primary/10 pt-3 text-sm">
      <li
        v-for="(step, i) in steps"
        :key="step.key"
        class="flex items-center gap-1.5"
        :class="
          step.done
            ? 'text-toned'
            : step.key === next
              ? 'font-medium text-highlighted'
              : 'text-muted'
        "
      >
        <UIcon
          :name="step.done ? 'i-lucide-circle-check' : 'i-lucide-circle'"
          class="size-4 shrink-0"
          :class="step.done ? 'text-success' : step.key === next ? 'text-primary' : 'text-dimmed'"
        />
        <span>
          <span class="sr-only">Étape {{ i + 1 }} : </span>{{ step.label
          }}<span class="sr-only">{{ step.done ? ' (faite)' : ' (à faire)' }}</span>
        </span>
      </li>
    </ol>
  </section>
</template>
