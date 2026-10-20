<script setup lang="ts">
/**
 * Frame of every signed-in page: a dashboard panel whose body holds a
 * centered column with the page header (title, one-line description,
 * actions) above the content. Leaves room for the mobile bottom tab bar.
 */
withDefaults(
  defineProps<{
    title: string
    description?: string
    /** Back link shown above the title (e.g. offer detail → offers). */
    back?: { to: string; label: string }
    /** `wide` for boards that need the whole width (kanban). */
    width?: 'default' | 'narrow' | 'wide'
  }>(),
  { description: undefined, back: undefined, width: 'default' },
)
</script>

<template>
  <UDashboardPanel :ui="{ root: 'bg-canvas', body: 'p-0 sm:p-0 gap-0' }">
    <template #body>
      <div
        class="mx-auto w-full px-4 pt-5 pb-[calc(var(--app-bottom-nav)+2rem)] sm:px-6 lg:px-10 lg:pt-10 lg:pb-16"
        :class="{
          'max-w-3xl': width === 'narrow',
          'max-w-5xl': width === 'default',
          'max-w-7xl': width === 'wide',
        }"
      >
        <AppLogo class="mb-6 lg:hidden" />

        <header class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div class="min-w-0 space-y-1.5">
            <UButton
              v-if="back"
              :to="back.to"
              :label="back.label"
              icon="i-lucide-arrow-left"
              color="neutral"
              variant="link"
              size="sm"
              class="-ml-1 mb-1 px-1"
            />
            <h1
              class="text-3xl leading-tight font-semibold text-balance text-highlighted sm:text-4xl"
            >
              <slot name="title">{{ title }}</slot>
            </h1>
            <p v-if="description || $slots.description" class="max-w-2xl text-pretty text-muted">
              <slot name="description">{{ description }}</slot>
            </p>
          </div>
          <div v-if="$slots.actions" class="flex shrink-0 flex-wrap gap-2">
            <slot name="actions" />
          </div>
        </header>

        <slot />
      </div>
    </template>
  </UDashboardPanel>
</template>
