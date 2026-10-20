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
  <UCard :ui="{ body: 'p-3 sm:p-3 space-y-2' }" class="cursor-grab active:cursor-grabbing">
    <button type="button" class="block w-full text-left" @click="emit('open')">
      <span class="block font-medium leading-snug">{{ application.offer.title }}</span>
      <span class="block text-sm text-muted">{{ application.offer.company }}</span>
    </button>

    <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
      <time :datetime="lastChange">{{ formatDateTime(lastChange) }}</time>
      <UBadge
        v-if="application.status === 'closed' && application.outcome"
        :label="outcomeLabels[application.outcome]"
        :color="application.outcome === 'accepted' ? 'success' : 'error'"
        variant="subtle"
        size="sm"
      />
    </div>

    <div class="flex justify-between">
      <UButton
        v-if="previous"
        icon="i-lucide-arrow-left"
        size="xs"
        color="neutral"
        variant="ghost"
        :aria-label="`Déplacer vers ${applicationStatusLabels[previous]}`"
        @click="emit('move', previous)"
      />
      <span v-else />
      <UButton
        v-if="next"
        icon="i-lucide-arrow-right"
        size="xs"
        color="neutral"
        variant="ghost"
        trailing
        :aria-label="`Déplacer vers ${applicationStatusLabels[next]}`"
        @click="emit('move', next)"
      />
    </div>
  </UCard>
</template>
