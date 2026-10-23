<script setup lang="ts">
import { CV_SKILL_MAX_LEVEL } from '@piston/shared'

/**
 * A 0–5 rating as a radio group of dots. Keyboard: arrows change the value
 * (left / down lowers, right / up raises), Home clears it, End sets the
 * maximum. Clicking the selected dot clears the rating. 0 means « no level ».
 */
const level = defineModel<number>({ required: true })
const props = defineProps<{ label: string }>()

const dots = Array.from({ length: CV_SKILL_MAX_LEVEL }, (_, index) => index + 1)
const group = useTemplateRef<HTMLElement>('group')

function set(next: number) {
  level.value = Math.min(CV_SKILL_MAX_LEVEL, Math.max(0, next))
  void nextTick(() =>
    group.value
      ?.querySelector<HTMLElement>(`[data-dot="${level.value || 1}"]`)
      ?.focus({ preventScroll: true }),
  )
}

function onKeydown(event: KeyboardEvent) {
  const moves: Record<string, number> = {
    ArrowRight: level.value + 1,
    ArrowUp: level.value + 1,
    ArrowLeft: level.value - 1,
    ArrowDown: level.value - 1,
    Home: 0,
    End: CV_SKILL_MAX_LEVEL,
  }
  const next = moves[event.key]
  if (next === undefined) return
  event.preventDefault()
  set(next)
}

const text = computed(() =>
  level.value ? `${level.value} sur ${CV_SKILL_MAX_LEVEL}` : 'Pas de niveau',
)
</script>

<template>
  <div class="flex items-center gap-2">
    <div
      ref="group"
      role="radiogroup"
      :aria-label="`Niveau de ${props.label}`"
      class="flex items-center gap-0.5"
      @keydown="onKeydown"
    >
      <button
        v-for="dot in dots"
        :key="dot"
        type="button"
        role="radio"
        :data-dot="dot"
        :aria-checked="level === dot"
        :aria-label="`${dot} sur ${CV_SKILL_MAX_LEVEL}`"
        :tabindex="level === dot || (level === 0 && dot === 1) ? 0 : -1"
        class="grid size-7 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-primary"
        @click="set(level === dot ? 0 : dot)"
      >
        <span
          class="size-3 rounded-full border transition-colors"
          :class="dot <= level ? 'border-primary bg-primary' : 'border-accented bg-transparent'"
        />
      </button>
    </div>
    <span class="w-24 text-xs text-muted" aria-live="polite">{{ text }}</span>
  </div>
</template>
