<script setup lang="ts">
import type { ResumeReviewOutput } from '@piston/shared'

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
  <div class="space-y-10">
    <section v-if="output.scores" aria-labelledby="review-scores">
      <h3 id="review-scores" class="sr-only">Notes</h3>
      <ul class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li v-for="score in scores" :key="score.key">
          <UCard :ui="{ body: 'flex flex-col items-center gap-3 p-4 sm:p-5' }">
            <ScoreRing :value="score.value" :max="10" :label="score.label" />
            <p class="text-sm font-medium text-toned">{{ score.label }}</p>
          </UCard>
        </li>
      </ul>
    </section>

    <section
      v-if="
        output.ats && (output.ats.score !== undefined || output.ats.summary || atsChecks.length)
      "
      aria-labelledby="review-ats"
    >
      <AppSectionHeading
        id="review-ats"
        title="Filtres ATS"
        icon="i-lucide-scan-search"
        description="Les logiciels de tri des candidatures lisent ton CV avant les recruteurs. Analyse faite sur le texte extrait, sans la mise en page."
      />
      <UCard :ui="{ body: 'space-y-5' }">
        <div class="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <ScoreRing :value="output.ats.score" :max="100" label="Compatibilité ATS" />
          <p
            v-if="output.ats.summary"
            class="min-w-0 flex-1 text-center text-pretty text-toned sm:text-left"
          >
            {{ output.ats.summary }}
          </p>
        </div>
        <ul v-if="atsChecks.length" class="space-y-2">
          <li
            v-for="(check, i) in atsChecks"
            :key="i"
            class="flex gap-3 rounded-xl border border-default bg-default p-3"
          >
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
      <AppSectionHeading
        id="review-strengths"
        title="Points forts"
        icon="i-lucide-thumbs-up"
        description="Ce qui fonctionne déjà : garde-le."
      />
      <ul class="space-y-3">
        <li v-for="(item, i) in output.strengths" :key="i">
          <UCard :ui="{ body: 'space-y-3' }">
            <blockquote
              v-if="item?.quote"
              class="rounded-r-lg border-l-4 border-success bg-success/5 py-2 pr-3 pl-4 font-display text-[0.95rem] text-toned italic"
            >
              « {{ item.quote }} »
            </blockquote>
            <p v-if="item?.comment" class="text-pretty">{{ item.comment }}</p>
          </UCard>
        </li>
      </ul>
    </section>

    <section v-if="output.improvements?.length" aria-labelledby="review-improvements">
      <AppSectionHeading
        id="review-improvements"
        title="Points à corriger"
        icon="i-lucide-wrench"
        description="Les phrases qui desservent ton CV, et comment les améliorer."
      />
      <ul class="space-y-3">
        <li v-for="(item, i) in output.improvements" :key="i">
          <UCard :ui="{ body: 'space-y-3' }">
            <blockquote
              v-if="item?.quote"
              class="rounded-r-lg border-l-4 border-warning bg-warning/5 py-2 pr-3 pl-4 font-display text-[0.95rem] text-toned italic"
            >
              « {{ item.quote }} »
            </blockquote>
            <dl class="grid gap-3 text-sm sm:grid-cols-2">
              <div v-if="item?.problem">
                <dt class="mb-0.5 flex items-center gap-1.5 font-semibold text-highlighted">
                  <UIcon name="i-lucide-circle-alert" class="size-4 text-warning" />
                  Problème
                </dt>
                <dd class="text-pretty text-toned">{{ item.problem }}</dd>
              </div>
              <div v-if="item?.suggestion">
                <dt class="mb-0.5 flex items-center gap-1.5 font-semibold text-highlighted">
                  <UIcon name="i-lucide-lightbulb" class="size-4 text-primary" />
                  Suggestion
                </dt>
                <dd class="text-pretty text-toned">{{ item.suggestion }}</dd>
              </div>
            </dl>
          </UCard>
        </li>
      </ul>
    </section>

    <section v-if="output.rewrite?.length" aria-labelledby="review-rewrite">
      <AppSectionHeading
        id="review-rewrite"
        title="Réécriture ligne par ligne"
        icon="i-lucide-replace"
        description="Les chiffres à compléter apparaissent entre crochets."
      />
      <ul class="space-y-3">
        <li
          v-for="(line, i) in output.rewrite"
          :key="i"
          class="grid overflow-hidden rounded-2xl border border-default bg-default lg:grid-cols-2"
        >
          <div class="border-b border-default bg-error/5 p-4 lg:border-r lg:border-b-0">
            <p class="mb-1 flex items-center gap-1.5 text-xs font-semibold text-error">
              <UIcon name="i-lucide-minus" class="size-3.5" aria-hidden="true" />
              Avant
            </p>
            <p class="text-sm text-pretty text-muted">{{ line?.original }}</p>
          </div>
          <div class="bg-success/5 p-4">
            <p class="mb-1 flex items-center gap-1.5 text-xs font-semibold text-success">
              <UIcon name="i-lucide-plus" class="size-3.5" aria-hidden="true" />
              Après
            </p>
            <p class="text-sm text-pretty text-highlighted">{{ line?.rewritten }}</p>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
