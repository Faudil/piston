<script setup lang="ts">
/**
 * A one-time tip at the top of a page: how to use it, in a sentence or two.
 * Closed for good with « Compris » (see useOnboarding).
 */
const props = defineProps<{ hint: keyof typeof pageTips }>()

const onboarding = useOnboarding()
const tip = computed(() => pageTips[props.hint])
</script>

<template>
  <Transition
    leave-active-class="transition duration-200 ease-in"
    leave-to-class="opacity-0 -translate-y-1"
  >
    <aside
      v-if="onboarding.isOpen(hint)"
      class="mb-8 flex gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:items-center sm:gap-4 sm:p-5"
      :aria-label="tip.title"
    >
      <span
        class="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <UIcon name="i-lucide-lightbulb" class="size-5" />
      </span>
      <div class="min-w-0 flex-1 space-y-0.5">
        <p class="font-medium text-highlighted">{{ tip.title }}</p>
        <p class="text-sm text-pretty text-muted">{{ tip.text }}</p>
      </div>
      <UButton
        label="Compris"
        color="neutral"
        variant="ghost"
        size="sm"
        class="shrink-0 self-start sm:self-center"
        @click="onboarding.dismiss(hint)"
      />
    </aside>
  </Transition>
</template>
