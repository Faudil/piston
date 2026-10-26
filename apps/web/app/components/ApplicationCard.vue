<script setup lang="ts">
import {
  applicationStatuses,
  applicationStatusLabels,
  type Application,
  type ApplicationStatus,
} from '@piston/shared'

const props = defineProps<{ application: Application }>()
const emit = defineEmits<{
  open: []
  move: [status: ApplicationStatus]
}>()

// Neighbouring columns, for the keyboard-friendly "move" buttons.
const index = computed(() => applicationStatuses.indexOf(props.application.status))
const previous = computed(() => applicationStatuses[index.value - 1])
const next = computed(() => applicationStatuses[index.value + 1])

const lastChange = computed(
  () => props.application.statusHistory.at(-1)?.at ?? props.application.createdAt,
)
</script>

<template>
  <article
    class="group cursor-grab rounded-xl border border-default bg-default p-3 shadow-xs transition hover:border-accented hover:shadow-sm active:cursor-grabbing"
  >
    <button
      type="button"
      class="block w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      @click="emit('open')"
    >
      <span class="block leading-snug font-medium text-highlighted">
        {{ application.offer.title }}
      </span>
      <span v-if="application.offer.company" class="mt-0.5 block text-sm text-muted">
        {{ application.offer.company }}
      </span>
    </button>

    <div class="mt-3 flex items-center gap-1">
      <UButton
        v-if="previous"
        icon="i-lucide-chevron-left"
        size="xs"
        color="neutral"
        variant="ghost"
        :aria-label="`Déplacer vers ${applicationStatusLabels[previous]}`"
        @click="emit('move', previous)"
      />
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs text-muted">
        <UIcon name="i-lucide-clock" class="size-3.5 shrink-0" />
        <time :datetime="lastChange" :title="formatDateTime(lastChange)">
          {{ formatDate(lastChange) }}
        </time>
        <UBadge
          v-if="application.status === 'closed' && application.outcome"
          :label="outcomeLabels[application.outcome]"
          :color="application.outcome === 'accepted' ? 'success' : 'error'"
          variant="subtle"
          size="sm"
        />
      </div>
      <UButton
        v-if="next"
        icon="i-lucide-chevron-right"
        size="xs"
        color="neutral"
        variant="ghost"
        :aria-label="`Déplacer vers ${applicationStatusLabels[next]}`"
        @click="emit('move', next)"
      />
    </div>
  </article>
</template>
