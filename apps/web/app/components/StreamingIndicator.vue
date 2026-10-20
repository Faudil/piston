<script setup lang="ts">
/** Discreet "Claude is writing" badge shown while a generation streams. */
withDefaults(defineProps<{ text?: string }>(), { text: 'Claude écrit…' })
</script>

<template>
  <p
    role="status"
    class="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
  >
    <span class="relative flex size-2" aria-hidden="true">
      <span
        class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60"
      />
      <span class="relative inline-flex size-2 rounded-full bg-primary" />
    </span>
    <UChatShimmer :text="text" class="text-primary" />
  </p>
</template>
