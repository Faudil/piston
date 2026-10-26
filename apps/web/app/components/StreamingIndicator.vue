<script setup lang="ts">
/**
 * Discreet "Claude is writing" badge shown while a generation streams. With a
 * `@stop` listener it also shows « Arrêter », which should abort the stream
 * (useGeneration's `abort()`): an aborted generation is not saved.
 */
withDefaults(
  defineProps<{
    text?: string
    /** Declared as a prop so the button only appears when a listener is given. */
    onStop?: () => void
  }>(),
  { text: 'Claude écrit…', onStop: undefined },
)
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
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
    <UButton
      v-if="onStop"
      label="Arrêter"
      icon="i-lucide-square"
      size="xs"
      color="neutral"
      variant="outline"
      @click="onStop()"
    />
  </div>
</template>
