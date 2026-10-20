<script setup lang="ts">
/** Heading of a page section: title, optional one-line description and actions. */
defineProps<{ id: string; title: string; description?: string; icon?: string }>()
</script>

<template>
  <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div class="min-w-0 space-y-1">
      <h2 :id="id" class="flex items-center gap-2 text-lg font-semibold text-highlighted">
        <UIcon v-if="icon" :name="icon" class="size-5 text-primary" />
        {{ title }}
      </h2>
      <p v-if="description" class="max-w-2xl text-sm text-pretty text-muted">{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="flex shrink-0 flex-wrap gap-2">
      <slot />
    </div>
  </div>
</template>
