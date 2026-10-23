<script setup lang="ts">
import type { CvCheck } from '@piston/shared'

/** The live checks of the document (no AI), errors first. Clicking one scrolls to its section. */
const props = defineProps<{ checks: CvCheck[] }>()
const emit = defineEmits<{ go: [check: CvCheck] }>()

const ICONS = {
  error: { name: 'i-lucide-circle-x', class: 'text-error' },
  warning: { name: 'i-lucide-triangle-alert', class: 'text-warning' },
  info: { name: 'i-lucide-info', class: 'text-info' },
} as const

const counts = computed(() => ({
  error: props.checks.filter((check) => check.level === 'error').length,
  warning: props.checks.filter((check) => check.level === 'warning').length,
}))
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm text-muted" aria-live="polite">
      <template v-if="!checks.length">Rien à signaler : ton CV est complet.</template>
      <template v-else>
        {{ counts.error }} à corriger · {{ counts.warning }} à vérifier ·
        {{ checks.length - counts.error - counts.warning }} conseil(s)
      </template>
    </p>
    <ul class="space-y-1.5">
      <li v-for="check in checks" :key="check.id">
        <component
          :is="check.target ? 'button' : 'div'"
          :type="check.target ? 'button' : undefined"
          class="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm"
          :class="
            check.target
              ? 'hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary'
              : ''
          "
          @click="check.target && emit('go', check)"
        >
          <UIcon
            :name="ICONS[check.level].name"
            class="mt-0.5 size-4 shrink-0"
            :class="ICONS[check.level].class"
          />
          <span class="sr-only"
            >{{ { error: 'Erreur', warning: 'À vérifier', info: 'Conseil' }[check.level] }} :</span
          >
          <span class="text-default">{{ check.message }}</span>
        </component>
      </li>
    </ul>
  </div>
</template>
