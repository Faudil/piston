<script setup lang="ts">
import type { ResumeReviewOutput } from '@piston/shared'

// Reading order: the scores, then what to fix and the rewrite (what the user
// acts on), then the ATS details and the strengths. One card per section, with
// a divided list inside, keeps the page calm even with fifteen items.
// `output` may be incomplete while Claude is still writing: every section,
// and every field of every item, can be missing.
const props = defineProps<{ output: Partial<ResumeReviewOutput> }>()

const scoreLabels: Record<keyof ResumeReviewOutput['scores'], string> = {
  lisibilite: 'Lisibilité',
  impact: 'Impact',
  motsCles: 'Mots-clés',
  coherence: 'Cohérence',
}

const scores = computed(() =>
  (Object.keys(scoreLabels) as Array<keyof typeof scoreLabels>).map((key) => ({
    key,
    label: scoreLabels[key],
    value: props.output.scores?.[key],
  })),
)
const hasAts = computed(
  () =>
    !!props.output.ats &&
    (props.output.ats.score !== undefined ||
      !!props.output.ats.summary ||
      atsChecks.value.length > 0),
)

// Full class names (not built from the status) so Tailwind finds them in the source.
const atsStatuses = {
  problem: { rank: 0, icon: 'i-lucide-circle-x', tone: 'text-error', label: 'Problème' },
  warning: {
    rank: 1,
    icon: 'i-lucide-triangle-alert',
    tone: 'text-warning',
    label: 'À surveiller',
  },
  ok: { rank: 2, icon: 'i-lucide-circle-check', tone: 'text-success', label: 'OK' },
} as const

// Problems first; the sort is stable, so Claude's order is kept inside a status.
const atsChecks = computed(() =>
  (props.output.ats?.checks ?? [])
    .filter((check) => check)
    .map((check) => ({
      ...check,
      meta: atsStatuses[check.status as keyof typeof atsStatuses] ?? atsStatuses.warning,
    }))
    .sort((a, b) => a.meta.rank - b.meta.rank),
)
</script>

<template>
  <div class="space-y-8">
    <UCard v-if="output.scores || output.ats?.score !== undefined" :ui="{ body: 'p-4 sm:p-6' }">
      <h3 class="sr-only">Notes</h3>
      <ul
        class="grid grid-cols-2 gap-y-5 sm:gap-4"
        :class="output.ats?.score !== undefined ? 'sm:grid-cols-5' : 'sm:grid-cols-4'"
      >
        <li
          v-for="score in scores"
          :key="score.key"
          class="flex flex-col items-center gap-2 text-center"
        >
          <ScoreRing :value="score.value" :max="10" :label="score.label" />
          <p class="text-sm font-medium text-toned">{{ score.label }}</p>
        </li>
        <li
          v-if="output.ats?.score !== undefined"
          class="col-span-2 flex flex-col items-center gap-2 text-center sm:col-span-1 sm:border-l sm:border-default"
        >
          <ScoreRing :value="output.ats.score" :max="100" label="Compatibilité ATS" />
          <p class="text-sm font-medium text-toned">Filtres ATS</p>
        </li>
      </ul>
    </UCard>

    <section v-if="output.improvements?.length" aria-labelledby="review-improvements">
      <h3 id="review-improvements" class="review-heading">
        <UIcon name="i-lucide-wrench" class="size-4 text-warning" />
        Points à corriger
      </h3>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ol class="divide-y divide-default">
          <li v-for="(item, i) in output.improvements" :key="i" class="space-y-2 p-4 sm:p-5">
            <blockquote
              v-if="item?.quote"
              class="border-l-2 border-warning pl-3 font-display text-[0.95rem] text-muted italic"
            >
              « {{ item.quote }} »
            </blockquote>
            <p v-if="item?.problem" class="text-pretty text-highlighted">{{ item.problem }}</p>
            <p v-if="item?.suggestion" class="flex gap-2 text-sm text-pretty text-toned">
              <UIcon
                name="i-lucide-arrow-right"
                class="mt-0.5 size-4 shrink-0 text-primary"
                aria-label="Suggestion :"
              />
              <span>{{ item.suggestion }}</span>
            </p>
          </li>
        </ol>
      </UCard>
    </section>

    <section v-if="output.rewrite?.length" aria-labelledby="review-rewrite">
      <h3 id="review-rewrite" class="review-heading">
        <UIcon name="i-lucide-replace" class="size-4 text-primary" />
        Réécriture ligne par ligne
        <span class="font-normal text-muted">· chiffres à compléter entre crochets</span>
      </h3>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ol class="divide-y divide-default">
          <li
            v-for="(line, i) in output.rewrite"
            :key="i"
            class="grid gap-3 p-4 sm:p-5 lg:grid-cols-2 lg:gap-6"
          >
            <p class="text-sm text-pretty text-muted line-through decoration-error/40">
              <span class="sr-only">Avant : </span>{{ line?.original }}
            </p>
            <p class="text-sm text-pretty text-highlighted">
              <span class="sr-only">Après : </span>{{ line?.rewritten }}
            </p>
          </li>
        </ol>
      </UCard>
    </section>

    <section v-if="hasAts" aria-labelledby="review-ats">
      <h3 id="review-ats" class="review-heading">
        <UIcon name="i-lucide-scan-search" class="size-4 text-primary" />
        Filtres ATS
      </h3>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <p v-if="output.ats?.summary" class="p-4 text-pretty text-toned sm:p-5">
          {{ output.ats.summary }}
        </p>
        <ul
          v-if="atsChecks.length"
          class="divide-y divide-default"
          :class="output.ats?.summary ? 'border-t border-default' : ''"
        >
          <li v-for="(check, i) in atsChecks" :key="i" class="flex gap-3 p-4 sm:px-5">
            <UIcon
              :name="check.meta.icon"
              class="mt-0.5 size-5 shrink-0"
              :class="check.meta.tone"
              aria-hidden="true"
            />
            <div class="min-w-0 space-y-1">
              <p class="font-medium text-highlighted">
                {{ check.criterion }}
                <span class="sr-only"> : {{ check.meta.label }}</span>
              </p>
              <p v-if="check.detail" class="text-sm text-pretty text-muted">{{ check.detail }}</p>
              <p v-if="check.fix" class="text-sm text-pretty text-toned">
                <span class="font-medium">À faire :</span> {{ check.fix }}
              </p>
            </div>
          </li>
        </ul>
      </UCard>
    </section>

    <section v-if="output.strengths?.length" aria-labelledby="review-strengths">
      <h3 id="review-strengths" class="review-heading">
        <UIcon name="i-lucide-thumbs-up" class="size-4 text-success" />
        Points forts
        <span class="font-normal text-muted">· à garder</span>
      </h3>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li v-for="(item, i) in output.strengths" :key="i" class="space-y-2 p-4 sm:p-5">
            <blockquote
              v-if="item?.quote"
              class="border-l-2 border-success pl-3 font-display text-[0.95rem] text-muted italic"
            >
              « {{ item.quote }} »
            </blockquote>
            <p v-if="item?.comment" class="text-pretty text-toned">{{ item.comment }}</p>
          </li>
        </ul>
      </UCard>
    </section>
  </div>
</template>

<style scoped>
.review-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}
</style>
