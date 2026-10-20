<script setup lang="ts">
/** Brand mark (a stylized piston) and, unless `compact`, the "Piston" wordmark. */
defineProps<{ compact?: boolean }>()

// Unique per instance: the sidebar and the page header can both show the mark.
const gradientId = useId()
</script>

<template>
  <span class="inline-flex items-center gap-2.5">
    <svg
      viewBox="0 0 32 32"
      class="size-8 shrink-0 drop-shadow-sm"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style="stop-color: var(--color-piston-400)" />
          <stop offset="1" style="stop-color: var(--color-piston-700)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" :fill="`url(#${gradientId})`" />
      <!-- Piston head with its two rings, then the connecting rod. -->
      <rect x="8" y="6.5" width="16" height="10" rx="2.5" fill="#fff" />
      <path d="M8 10h16M8 13h16" style="stroke: var(--color-piston-600)" stroke-width="1.2" />
      <path d="M16 16.5v7" stroke="#fff" stroke-width="3" stroke-linecap="round" />
      <circle cx="16" cy="24.5" r="3" fill="none" stroke="#fff" stroke-width="2" />
    </svg>
    <span v-if="!compact" class="font-display text-xl font-semibold text-highlighted">Piston</span>
  </span>
</template>
