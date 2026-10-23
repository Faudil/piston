<script setup lang="ts">
import type { CvDragLevel } from '~/utils/cv-drag'

/**
 * The grip of a draggable card. Mouse and touch only: keyboard and
 * screen-reader users move things with the up / down buttons next to it.
 */
defineProps<{ level: CvDragLevel; label?: string }>()
</script>

<template>
  <span
    :class="`cv-drag-${level}`"
    class="inline-flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted select-none hover:bg-elevated hover:text-default active:cursor-grabbing"
    :title="label ?? 'Glisser pour déplacer'"
    aria-hidden="true"
  >
    <UIcon name="i-lucide-grip-vertical" class="size-4" />
  </span>
</template>
