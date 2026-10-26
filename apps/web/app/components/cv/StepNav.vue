<script setup lang="ts">
import type { CvStep } from '~/utils/cv-steps'

/**
 * Phone-only navigation of the step-by-step CV editor: at the top, where you
 * are (« Étape 2 sur 6 », a progress bar) and the list of sections to jump to;
 * at the bottom, « Précédent » / « Suivant ». The editor shows one section
 * per screen; the wide layout does not use this component.
 */
const props = defineProps<{
  placement: 'top' | 'bottom'
  steps: CvStep[]
  current: string
  /** Sections that can still be added (shown in the list sheet). */
  addable?: Array<{ ref: string; label: string }>
}>()
const emit = defineEmits<{
  select: [ref: string]
  add: [ref: string]
  addCustom: []
  finish: []
}>()

const listOpen = ref(false)
const progress = computed(() => cvStepProgress(props.steps, props.current))
const index = computed(() => progress.value.position - 1)
const label = computed(() => props.steps[index.value]?.label ?? '')
const isLast = computed(() => progress.value.position === progress.value.total)

function select(ref: string) {
  listOpen.value = false
  emit('select', ref)
}
</script>

<template>
  <div v-if="placement === 'top'" class="space-y-2 lg:hidden" data-testid="step-nav">
    <div class="flex items-center gap-3">
      <div class="min-w-0 flex-1" role="status" aria-live="polite">
        <p class="text-xs font-medium text-muted">
          Étape {{ progress.position }} sur {{ progress.total }}
        </p>
        <p class="truncate text-lg font-semibold text-highlighted">{{ label }}</p>
      </div>
      <UButton
        label="Sections"
        icon="i-lucide-list"
        color="neutral"
        variant="outline"
        class="min-h-11 shrink-0"
        aria-haspopup="dialog"
        @click="listOpen = true"
      />
    </div>
    <div
      class="h-1.5 overflow-hidden rounded-full bg-elevated"
      role="progressbar"
      aria-label="Progression dans le CV"
      :aria-valuenow="progress.position"
      aria-valuemin="1"
      :aria-valuemax="progress.total"
      :aria-valuetext="`Étape ${progress.position} sur ${progress.total}`"
    >
      <div
        class="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
        :style="{ width: `${progress.percent}%` }"
      />
    </div>

    <USlideover
      v-model:open="listOpen"
      side="bottom"
      title="Sections du CV"
      description="Touche une section pour l’éditer."
      :ui="{ content: 'max-h-[85dvh]', body: 'pb-[calc(1rem+env(safe-area-inset-bottom))]' }"
    >
      <template #body>
        <ol class="space-y-1.5">
          <li v-for="(step, i) in steps" :key="step.ref">
            <button
              type="button"
              class="flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-primary"
              :class="
                step.ref === current ? 'border-primary bg-primary/8' : 'border-default bg-default'
              "
              :aria-current="step.ref === current ? 'step' : undefined"
              @click="select(step.ref)"
            >
              <span
                class="grid size-7 shrink-0 place-items-center rounded-full bg-elevated text-xs font-semibold text-muted"
                aria-hidden="true"
              >
                {{ i + 1 }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-highlighted">{{ step.label }}</span>
                <span v-if="step.summary" class="block truncate text-xs text-muted">
                  {{ step.summary }}
                </span>
              </span>
              <UIcon
                v-if="step.ref === current"
                name="i-lucide-check"
                class="size-5 shrink-0 text-primary"
              />
            </button>
          </li>
        </ol>
        <div class="mt-5 space-y-2">
          <p class="text-sm font-medium text-highlighted">Ajouter une section</p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="section in addable"
              :key="section.ref"
              :label="section.label"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              class="min-h-11"
              @click="((listOpen = false), emit('add', section.ref))"
            />
            <UButton
              label="Section personnalisée…"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              class="min-h-11"
              @click="((listOpen = false), emit('addCustom'))"
            />
          </div>
        </div>
      </template>
    </USlideover>
  </div>

  <div v-else class="grid grid-cols-2 gap-3 lg:hidden">
    <UButton
      label="Précédent"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="outline"
      size="lg"
      block
      class="min-h-11"
      :disabled="index === 0"
      @click="emit('select', cvStepAfter(steps, current, -1))"
    />
    <UButton
      v-if="!isLast"
      label="Suivant"
      trailing-icon="i-lucide-arrow-right"
      size="lg"
      block
      class="min-h-11"
      @click="emit('select', cvStepAfter(steps, current, 1))"
    />
    <UButton
      v-else
      label="Voir l’aperçu"
      trailing-icon="i-lucide-eye"
      size="lg"
      block
      class="min-h-11"
      @click="emit('finish')"
    />
  </div>
</template>
