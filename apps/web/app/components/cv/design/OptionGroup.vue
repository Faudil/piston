<script setup lang="ts" generic="T extends string | number">
/**
 * A labelled choice among a few values (radio group), for one design token.
 * `value` is the resolved value (the override, or the template's); `overridden`
 * says whether the user changed it, and « Rétablir » clears the override.
 */
defineProps<{
  label: string
  items: ReadonlyArray<{ value: T; label: string }>
  value: T
  overridden: boolean
  /** One line under the label (what the template does). */
  hint?: string
}>()
const emit = defineEmits<{ change: [value: T]; reset: [] }>()

const id = useId()
</script>

<template>
  <fieldset class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <legend :id="`${id}-label`" class="text-sm font-medium text-highlighted">
        {{ label }}
        <UBadge
          v-if="overridden"
          label="Modifié"
          color="primary"
          variant="subtle"
          size="sm"
          class="ml-1"
        />
      </legend>
      <UButton
        v-if="overridden"
        label="Rétablir"
        icon="i-lucide-rotate-ccw"
        size="xs"
        color="neutral"
        variant="link"
        :aria-label="`Rétablir ${label} au modèle`"
        @click="emit('reset')"
      />
    </div>
    <div class="flex flex-wrap gap-1.5" role="radiogroup" :aria-labelledby="`${id}-label`">
      <UButton
        v-for="item in items"
        :key="String(item.value)"
        :label="item.label"
        size="sm"
        role="radio"
        :aria-checked="item.value === value"
        :variant="item.value === value ? 'solid' : 'outline'"
        :color="item.value === value ? 'primary' : 'neutral'"
        @click="emit('change', item.value)"
      />
    </div>
    <p v-if="hint" class="text-xs text-muted">{{ hint }}</p>
  </fieldset>
</template>
