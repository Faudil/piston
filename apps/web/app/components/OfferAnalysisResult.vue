<script setup lang="ts">
import type { OfferAnalysisOutput } from '@piston/shared'

// `output` may be incomplete while Claude is still writing: every section,
// and every field of every item, can be missing.
const props = defineProps<{ output: Partial<OfferAnalysisOutput> }>()

const score = computed(() =>
  typeof props.output.matchScore === 'number'
    ? Math.max(0, Math.min(100, Math.round(props.output.matchScore)))
    : null,
)
// Full class names (not built from the color) so Tailwind finds them in the source.
const levels = {
  high: { color: 'success', text: 'text-success', label: 'Bonne correspondance' },
  medium: { color: 'warning', text: 'text-warning', label: 'Correspondance partielle' },
  low: { color: 'error', text: 'text-error', label: 'Correspondance faible' },
} as const
const level = computed(() =>
  score.value === null
    ? null
    : levels[score.value >= 70 ? 'high' : score.value >= 40 ? 'medium' : 'low'],
)
</script>

<template>
  <div class="space-y-8">
    <section v-if="score !== null && level" aria-labelledby="analysis-score" class="space-y-3">
      <h3 id="analysis-score" class="sr-only">Score de correspondance</h3>
      <div class="flex items-baseline gap-2">
        <span class="text-4xl font-bold" :class="level.text">{{ score }}</span>
        <span class="text-muted">/ 100</span>
        <UBadge :color="level.color" variant="subtle" :label="level.label" class="ml-2" />
      </div>
      <UProgress :model-value="score" :color="level.color" aria-label="Score de correspondance" />
    </section>

    <p v-if="output.summary" class="text-pretty">{{ output.summary }}</p>

    <section
      v-if="output.matchingSkills?.length"
      aria-labelledby="analysis-matching"
      class="space-y-3"
    >
      <h3 id="analysis-matching" class="font-semibold">Compétences qui matchent</h3>
      <ul class="space-y-2">
        <li v-for="(item, i) in output.matchingSkills" :key="i" class="flex gap-2">
          <UIcon name="i-lucide-circle-check" class="mt-0.5 size-5 shrink-0 text-success" />
          <div>
            <p class="font-medium">{{ item?.skill }}</p>
            <p v-if="item?.evidence" class="text-sm text-muted">{{ item.evidence }}</p>
          </div>
        </li>
      </ul>
    </section>

    <section
      v-if="output.missingSkills?.length"
      aria-labelledby="analysis-missing"
      class="space-y-3"
    >
      <h3 id="analysis-missing" class="font-semibold">Compétences manquantes</h3>
      <ul class="space-y-2">
        <li v-for="(item, i) in output.missingSkills" :key="i" class="flex gap-2">
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p class="font-medium">{{ item?.skill }}</p>
            <p v-if="item?.advice" class="text-sm text-muted">{{ item.advice }}</p>
          </div>
        </li>
      </ul>
    </section>

    <section
      v-if="output.interviewQuestions?.length"
      aria-labelledby="analysis-questions"
      class="space-y-3"
    >
      <h3 id="analysis-questions" class="font-semibold">Questions d'entretien probables</h3>
      <ol class="space-y-3">
        <li v-for="(item, i) in output.interviewQuestions" :key="i" class="flex gap-3">
          <span class="font-semibold text-primary">{{ i + 1 }}.</span>
          <div>
            <p class="font-medium">{{ item?.question }}</p>
            <p v-if="item?.hint" class="text-sm text-muted">
              <span class="font-medium">Piste :</span> {{ item.hint }}
            </p>
          </div>
        </li>
      </ol>
    </section>

    <section v-if="output.jargon?.length" aria-labelledby="analysis-jargon" class="space-y-3">
      <h3 id="analysis-jargon" class="font-semibold">Le jargon RH, traduit</h3>
      <dl class="space-y-2">
        <div v-for="(item, i) in output.jargon" :key="i">
          <dt class="font-medium">« {{ item?.term }} »</dt>
          <dd v-if="item?.meaning" class="text-sm text-muted">{{ item.meaning }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>
