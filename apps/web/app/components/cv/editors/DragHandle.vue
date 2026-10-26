<script setup lang="ts">
import type { CvDragLevel } from '~/utils/cv-drag'

/**
 * The grip of a draggable card. Mouse and touch only: keyboard and
 * screen-reader users move things with the up / down buttons next to it (on
 * phones, in the card's « … » menu). A 44 px target on touch screens; it
 * allows vertical panning (`touch-pan-y`), so a swipe that starts on it
 * scrolls the page, and only a long press picks the card up.
 */
defineProps<{ level: CvDragLevel; label?: string }>()
</script>

<template>
  <span
    :class="`cv-drag-${level}`"
    class="inline-flex size-11 shrink-0 cursor-grab touch-pan-y lg:size-8 items-center justify-center rounded-md text-muted select-none hover:bg-elevated hover:text-default active:cursor-grabbing"
    :title="label ?? 'Glisser pour déplacer'"
    aria-hidden="true"
  >
    <UIcon name="i-lucide-grip-vertical" class="size-4" />
  </span>
</template>
