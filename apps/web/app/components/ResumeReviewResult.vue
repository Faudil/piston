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
</script>

<template>
  <div class="space-y-8">
    <section v-if="output.scores" aria-labelledby="review-scores" class="space-y-3">
      <h2 id="review-scores" class="text-lg font-semibold">Notes</h2>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <UCard v-for="score in scores" :key="score.key">
          <p class="text-sm text-muted">{{ score.label }}</p>
          <p class="text-2xl font-semibold">
            <template v-if="typeof score.value === 'number'">{{ score.value }}</template>
            <template v-else>…</template>
            <span class="text-base font-normal text-muted">/10</span>
          </p>
          <UProgress
            v-if="typeof score.value === 'number'"
            :model-value="score.value"
            :max="10"
            size="sm"
            class="mt-2"
            :aria-label="`${score.label} : ${score.value} sur 10`"
          />
        </UCard>
      </div>
    </section>

    <section v-if="output.strengths?.length" aria-labelledby="review-strengths" class="space-y-3">
      <h2 id="review-strengths" class="text-lg font-semibold">Points forts</h2>
      <ul class="space-y-3">
        <li v-for="(item, i) in output.strengths" :key="i">
          <UCard>
            <blockquote
              v-if="item?.quote"
              class="border-l-4 border-success pl-3 text-sm italic text-toned"
            >
              « {{ item.quote }} »
            </blockquote>
            <p v-if="item?.comment" class="mt-2">{{ item.comment }}</p>
          </UCard>
        </li>
      </ul>
    </section>

    <section
      v-if="output.improvements?.length"
      aria-labelledby="review-improvements"
      class="space-y-3"
    >
      <h2 id="review-improvements" class="text-lg font-semibold">Points à corriger</h2>
      <ul class="space-y-3">
        <li v-for="(item, i) in output.improvements" :key="i">
          <UCard>
            <blockquote
              v-if="item?.quote"
              class="border-l-4 border-warning pl-3 text-sm italic text-toned"
            >
              « {{ item.quote }} »
            </blockquote>
            <dl class="mt-2 space-y-2 text-sm">
              <div v-if="item?.problem">
                <dt class="font-medium">Problème</dt>
                <dd class="text-muted">{{ item.problem }}</dd>
              </div>
              <div v-if="item?.suggestion">
                <dt class="font-medium">Suggestion</dt>
                <dd class="text-muted">{{ item.suggestion }}</dd>
              </div>
            </dl>
          </UCard>
        </li>
      </ul>
    </section>

    <section v-if="output.rewrite?.length" aria-labelledby="review-rewrite" class="space-y-3">
      <h2 id="review-rewrite" class="text-lg font-semibold">Réécriture ligne par ligne</h2>
      <!-- Column headers only make sense when the two versions sit side by side. -->
      <div class="hidden gap-3 text-sm font-medium text-muted lg:grid lg:grid-cols-2">
        <p>Original</p>
        <p>Réécrit</p>
      </div>
      <ul class="space-y-3">
        <li
          v-for="(line, i) in output.rewrite"
          :key="i"
          class="grid gap-2 rounded-md border border-default p-3 lg:grid-cols-2 lg:gap-3"
        >
          <div>
            <p class="text-xs font-medium text-muted lg:hidden">Original</p>
            <p class="text-sm text-muted line-through decoration-error/40">{{ line?.original }}</p>
          </div>
          <div>
            <p class="text-xs font-medium text-muted lg:hidden">Réécrit</p>
            <p class="text-sm">{{ line?.rewritten }}</p>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
