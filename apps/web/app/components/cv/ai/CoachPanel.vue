<script setup lang="ts">
import {
  checkCv,
  cvAtsLevelLabels,
  cvCompleteness,
  cvTemplates,
  type CvCheck,
  type CvCoachResponse,
  type CvContent,
  type CvDesign,
  type CvEditBody,
  type CvFixSource,
  type CvFixTarget,
  type CvTemplateId,
} from '@piston/shared'

/**
 * The coach: a score summary, then everything worth fixing in the document,
 * from the instant checks (no AI) and from the latest review and ATS check of
 * the document's profile, grouped by severity. Each issue has « Proposer une
 * correction », which asks Claude for a reviewed proposal about that issue
 * only (the parent runs it in the AI panel).
 */
const props = defineProps<{
  documentId: string
  content: CvContent
  /** The live checks need the design and the template; without them only the review is shown. */
  design?: CvDesign
  templateId?: CvTemplateId
  /** The page count from the preview, when known. */
  pageCount?: number
  disabled?: boolean
}>()
const emit = defineEmits<{ fix: [body: Omit<CvEditBody, 'documentId'>, label: string] }>()

const { data: coach } = await useFetch<CvCoachResponse>(
  () => `/api/cv-documents/${props.documentId}/coach`,
  { default: () => ({ review: null }), lazy: true },
)
const review = computed(() => coach.value.review)

type Level = 'error' | 'warning' | 'info'
interface Issue {
  id: string
  level: Level
  source: CvFixSource
  /** Where it comes from, shown as a small label. */
  origin: string
  text: string
  advice?: string
  target: CvFixTarget
}

const checks = computed<CvCheck[]>(() =>
  props.design && props.templateId
    ? checkCv(props.content, props.design, props.templateId, { pageCount: props.pageCount })
    : [],
)

const issues = computed<Issue[]>(() => {
  const fromChecks = checks.value.map((check) => ({
    id: `check:${check.id}`,
    level: check.level,
    source: 'check' as const,
    origin: 'Vérification',
    text: check.message,
    target: check.target ?? {},
  }))
  const current = review.value
  if (!current) return fromChecks
  const fromAts = current.atsIssues.map((issue, index) => ({
    id: `ats:${index}`,
    level: issue.status === 'problem' ? ('error' as const) : ('warning' as const),
    source: 'ats' as const,
    origin: 'Lecture ATS',
    text: `${issue.criterion} : ${issue.detail}`,
    advice: issue.fix || undefined,
    target: {},
  }))
  const fromReview = current.improvements.map((improvement, index) => ({
    id: `review:${index}`,
    level: 'warning' as const,
    source: 'review' as const,
    origin: 'Critique',
    text: `« ${improvement.quote} » : ${improvement.problem}`,
    advice: improvement.suggestion,
    target: {},
  }))
  return [...fromChecks, ...fromAts, ...fromReview]
})

const GROUPS: Array<{ level: Level; title: string; icon: string; iconClass: string }> = [
  { level: 'error', title: 'À corriger', icon: 'i-lucide-circle-x', iconClass: 'text-error' },
  {
    level: 'warning',
    title: 'À vérifier',
    icon: 'i-lucide-triangle-alert',
    iconClass: 'text-warning',
  },
  { level: 'info', title: 'Conseils', icon: 'i-lucide-info', iconClass: 'text-info' },
]
const groups = computed(() =>
  GROUPS.map((group) => ({
    ...group,
    issues: issues.value.filter((issue) => issue.level === group.level),
  })).filter((group) => group.issues.length),
)

function fix(issue: Issue) {
  const text = [issue.text, issue.advice && `Conseil : ${issue.advice}`].filter(Boolean).join('\n')
  const short = issue.text.length > 50 ? `${issue.text.slice(0, 47)}…` : issue.text
  emit(
    { mode: 'fix', issue: text.slice(0, 800), source: issue.source, target: issue.target },
    `IA : correction « ${short} »`,
  )
}

// --- Scores ------------------------------------------------------------------------

const completeness = computed(() => cvCompleteness(props.content))
const template = computed(() => (props.templateId ? cvTemplates[props.templateId] : null))
const ATS_COLORS = { optimal: 'success', bon: 'warning', limite: 'error' } as const
const staleReview = computed(
  () => review.value && (!review.value.isCurrentVersion || review.value.documentChangedSince),
)
const reviewDate = computed(() =>
  review.value
    ? new Date(review.value.createdAt).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
      })
    : '',
)
</script>

<template>
  <section aria-labelledby="ai-coach" class="space-y-4">
    <h3 id="ai-coach" class="flex items-center gap-2 font-semibold text-highlighted">
      <UIcon name="i-lucide-clipboard-check" class="size-5 text-primary" />
      Coach
    </h3>

    <dl class="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div class="rounded-xl border border-default p-3">
        <dt class="text-xs text-muted">Complétude</dt>
        <dd class="text-lg font-semibold text-highlighted">{{ completeness.score }} / 100</dd>
        <p v-if="completeness.missing.length" class="mt-1 text-xs text-muted">
          Il manque : {{ completeness.missing.slice(0, 2).join(', ') }}.
        </p>
      </div>
      <div class="rounded-xl border border-default p-3">
        <dt class="text-xs text-muted">Lecture par les ATS</dt>
        <dd v-if="template" class="mt-1">
          <UBadge
            :label="cvAtsLevelLabels[template.atsLevel]"
            :color="ATS_COLORS[template.atsLevel]"
            variant="subtle"
          />
        </dd>
        <dd v-else class="text-sm text-muted">Inconnue</dd>
        <p v-if="template" class="mt-1 text-xs text-muted">Modèle « {{ template.label }} »</p>
      </div>
      <div class="rounded-xl border border-default p-3">
        <dt class="text-xs text-muted">Dernière critique</dt>
        <template v-if="review">
          <dd class="text-lg font-semibold text-highlighted">
            <template v-if="review.score !== null">{{ review.score }} / 10</template>
            <span v-if="review.atsScore !== null" class="text-sm font-normal text-muted">
              <template v-if="review.score !== null">·</template> ATS {{ review.atsScore }}
            </span>
          </dd>
          <p class="mt-1 text-xs text-muted">Du {{ reviewDate }}</p>
        </template>
        <dd v-else class="text-sm text-muted">
          Aucune.
          <NuxtLink to="/cv" class="text-primary underline">Lance une critique</NuxtLink> après
          avoir enregistré ce CV comme version.
        </dd>
      </div>
    </dl>

    <UAlert
      v-if="staleReview"
      color="warning"
      variant="subtle"
      icon="i-lucide-history"
      title="La critique date d’avant tes dernières modifications"
      description="Ses remarques peuvent ne plus s’appliquer : enregistre une nouvelle version et relance une critique pour la mettre à jour."
    />

    <p v-if="!groups.length" class="text-sm text-muted">
      Rien à signaler pour l’instant. Ton CV est cohérent.
    </p>

    <div v-for="group in groups" :key="group.level" class="space-y-2">
      <h4 class="flex items-center gap-1.5 text-sm font-medium text-highlighted">
        <UIcon :name="group.icon" class="size-4" :class="group.iconClass" />
        {{ group.title }} ({{ group.issues.length }})
      </h4>
      <ul class="space-y-2">
        <li
          v-for="issue in group.issues"
          :key="issue.id"
          class="rounded-xl border border-default p-3 text-sm"
        >
          <p class="mb-1">
            <UBadge :label="issue.origin" color="neutral" variant="subtle" size="sm" />
          </p>
          <p class="text-pretty text-default">{{ issue.text }}</p>
          <p v-if="issue.advice" class="mt-1 text-pretty text-muted">{{ issue.advice }}</p>
          <UButton
            class="mt-2"
            label="Proposer une correction"
            icon="i-lucide-sparkles"
            size="xs"
            variant="soft"
            :disabled="disabled"
            :aria-label="`Proposer une correction : ${issue.text.slice(0, 80)}`"
            @click="fix(issue)"
          />
        </li>
      </ul>
    </div>
  </section>
</template>
