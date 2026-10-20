<script setup lang="ts">
/**
 * Radial gauge for a score (e.g. 7/10 or 82/100), colored by level.
 * `value` is undefined while Claude has not written it yet: the ring then
 * shows a pulsing placeholder.
 */
const props = withDefaults(
  defineProps<{
    value?: number
    max: number
    label: string
    size?: 'md' | 'lg'
  }>(),
  { value: undefined, size: 'md' },
)

const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const clamped = computed(() =>
  typeof props.value === 'number'
    ? Math.max(0, Math.min(props.max, Math.round(props.value)))
    : null,
)
const ratio = computed(() => (clamped.value ?? 0) / props.max)

// Full class names (not built from the color) so Tailwind finds them in the source.
const tone = computed(() => {
  if (clamped.value === null) return 'text-dimmed'
  if (ratio.value >= 0.7) return 'text-success'
  if (ratio.value >= 0.4) return 'text-warning'
  return 'text-error'
})
</script>

<template>
  <div
    class="relative grid shrink-0 place-items-center"
    :class="size === 'lg' ? 'size-36 sm:size-40' : 'size-20'"
    role="img"
    :aria-label="clamped === null ? `${label} : en cours` : `${label} : ${clamped} sur ${max}`"
  >
    <svg viewBox="0 0 100 100" class="absolute inset-0 -rotate-90" aria-hidden="true">
      <circle
        cx="50"
        cy="50"
        :r="RADIUS"
        fill="none"
        stroke-width="8"
        style="stroke: var(--ui-bg-accented)"
      />
      <circle
        v-if="clamped !== null"
        cx="50"
        cy="50"
        :r="RADIUS"
        fill="none"
        stroke-width="8"
        stroke-linecap="round"
        stroke="currentColor"
        :class="tone"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="CIRCUMFERENCE * (1 - ratio)"
        style="transition: stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)"
      />
    </svg>
    <span v-if="clamped === null" class="size-1/3 animate-pulse rounded-full bg-elevated" />
    <span v-else class="relative flex items-baseline font-display" :class="tone">
      <span :class="size === 'lg' ? 'text-5xl font-semibold' : 'text-2xl font-semibold'">
        {{ clamped }}
      </span>
      <span class="ml-0.5 text-muted" :class="size === 'lg' ? 'text-base' : 'text-xs'">
        /{{ max }}
      </span>
    </span>
  </div>
</template>
