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
  high: { color: 'success', label: 'Bonne correspondance' },
  medium: { color: 'warning', label: 'Correspondance partielle' },
  low: { color: 'error', label: 'Correspondance faible' },
} as const
const level = computed(() =>
  score.value === null
    ? null
    : levels[score.value >= 70 ? 'high' : score.value >= 40 ? 'medium' : 'low'],
)
</script>

<template>
  <div class="space-y-10">
    <UCard
      v-if="score !== null || output.summary"
      :ui="{ body: 'flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8' }"
    >
      <ScoreRing :value="score ?? undefined" :max="100" label="Score de correspondance" size="lg" />
      <div class="min-w-0 flex-1 space-y-3 text-center sm:text-left">
        <UBadge v-if="level" :color="level.color" variant="subtle" :label="level.label" size="lg" />
        <p v-if="output.summary" class="max-w-prose text-pretty text-toned">
          {{ output.summary }}
        </p>
      </div>
    </UCard>

    <section
      v-if="
        output.atsMatch &&
        (output.atsMatch.score !== undefined ||
          output.atsMatch.foundKeywords?.length ||
          output.atsMatch.missingKeywords?.length)
      "
      aria-labelledby="analysis-ats"
    >
      <AppSectionHeading
        id="analysis-ats"
        title="Compatibilité ATS avec l'offre"
        icon="i-lucide-scan-search"
        description="Les mots-clés de l'offre sur lesquels un logiciel de tri filtre les CV."
      />
      <UCard :ui="{ body: 'space-y-5' }">
        <div class="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <ScoreRing
            :value="output.atsMatch.score"
            :max="100"
            label="Compatibilité ATS avec l'offre"
          />
          <div v-if="output.atsMatch.foundKeywords?.length" class="min-w-0 flex-1 space-y-2">
            <p class="text-sm font-semibold text-highlighted">Mots-clés présents dans ton CV</p>
            <ul class="flex flex-wrap gap-2">
              <li v-for="(keyword, i) in output.atsMatch.foundKeywords" :key="i">
                <UBadge color="success" variant="subtle" :label="keyword" icon="i-lucide-check" />
              </li>
            </ul>
          </div>
        </div>
        <div v-if="output.atsMatch.missingKeywords?.length" class="space-y-2">
          <p class="text-sm font-semibold text-highlighted">Mots-clés absents</p>
          <ul class="space-y-2">
            <li
              v-for="(item, i) in output.atsMatch.missingKeywords"
              :key="i"
              class="flex gap-3 rounded-xl border border-default bg-default p-3"
            >
              <UIcon
                name="i-lucide-circle-dashed"
                class="mt-0.5 size-5 shrink-0 text-warning"
                aria-hidden="true"
              />
              <div class="min-w-0">
                <p class="font-medium text-highlighted">{{ item?.keyword }}</p>
                <p v-if="item?.suggestion" class="text-sm text-pretty text-muted">
                  {{ item.suggestion }}
                </p>
              </div>
            </li>
          </ul>
        </div>
      </UCard>
    </section>

    <div
      v-if="output.matchingSkills?.length || output.missingSkills?.length"
      class="grid gap-8 lg:grid-cols-2"
    >
      <section v-if="output.matchingSkills?.length" aria-labelledby="analysis-matching">
        <AppSectionHeading
          id="analysis-matching"
          title="Compétences qui matchent"
          icon="i-lucide-circle-check"
        />
        <ul class="space-y-2">
          <li
            v-for="(item, i) in output.matchingSkills"
            :key="i"
            class="flex gap-3 rounded-xl border border-default bg-default p-3"
          >
            <UIcon name="i-lucide-check" class="mt-0.5 size-5 shrink-0 text-success" />
            <div class="min-w-0">
              <p class="font-medium text-highlighted">{{ item?.skill }}</p>
              <p v-if="item?.evidence" class="text-sm text-pretty text-muted">
                {{ item.evidence }}
              </p>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="output.missingSkills?.length" aria-labelledby="analysis-missing">
        <AppSectionHeading
          id="analysis-missing"
          title="Compétences manquantes"
          icon="i-lucide-circle-dashed"
        />
        <ul class="space-y-2">
          <li
            v-for="(item, i) in output.missingSkills"
            :key="i"
            class="flex gap-3 rounded-xl border border-default bg-default p-3"
          >
            <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-5 shrink-0 text-warning" />
            <div class="min-w-0">
              <p class="font-medium text-highlighted">{{ item?.skill }}</p>
              <p v-if="item?.advice" class="text-sm text-pretty text-muted">{{ item.advice }}</p>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <section v-if="output.interviewQuestions?.length" aria-labelledby="analysis-questions">
      <AppSectionHeading
        id="analysis-questions"
        title="Questions d'entretien probables"
        icon="i-lucide-messages-square"
        description="Prépare une réponse appuyée sur l'élément de ton CV indiqué."
      />
      <ol class="space-y-3">
        <li v-for="(item, i) in output.interviewQuestions" :key="i">
          <UCard :ui="{ body: 'flex gap-4 p-4 sm:p-5' }">
            <span
              class="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 font-display font-semibold text-primary"
              aria-hidden="true"
            >
              {{ i + 1 }}
            </span>
            <div class="min-w-0 space-y-1">
              <p class="font-medium text-pretty text-highlighted">{{ item?.question }}</p>
              <p v-if="item?.hint" class="text-sm text-pretty text-muted">
                <span class="font-medium text-toned">Piste :</span> {{ item.hint }}
              </p>
            </div>
          </UCard>
        </li>
      </ol>
    </section>

    <section v-if="output.jargon?.length" aria-labelledby="analysis-jargon">
      <AppSectionHeading
        id="analysis-jargon"
        title="Le jargon RH, traduit"
        icon="i-lucide-languages"
      />
      <dl class="grid gap-3 sm:grid-cols-2">
        <div
          v-for="(item, i) in output.jargon"
          :key="i"
          class="rounded-xl border border-default bg-default p-4"
        >
          <dt class="font-display font-medium text-highlighted italic">« {{ item?.term }} »</dt>
          <dd v-if="item?.meaning" class="mt-1 text-sm text-pretty text-muted">
            {{ item.meaning }}
          </dd>
        </div>
      </dl>
    </section>
  </div>
</template>
