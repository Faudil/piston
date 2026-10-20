<script setup lang="ts">
import type { Resume } from '@piston/shared'

defineProps<{
  resumes: Resume[]
  /** Id of the version currently being reviewed, to show a spinner on its button. */
  reviewingId?: string | null
}>()

const emit = defineEmits<{
  review: [resume: Resume]
  setCurrent: [resume: Resume]
}>()

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
</script>

<template>
  <ul class="divide-y divide-default rounded-md border border-default">
    <li
      v-for="resume in resumes"
      :key="resume.id"
      class="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="min-w-0">
        <p class="flex items-center gap-2 font-medium">
          <span class="truncate">{{ resume.title }}</span>
          <UBadge v-if="resume.isCurrent" label="Actuel" color="primary" variant="subtle" />
        </p>
        <p class="text-sm text-muted">
          {{ dateFormat.format(new Date(resume.createdAt)) }}
          <template v-if="resume.sourceFilename"> · {{ resume.sourceFilename }}</template>
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <UButton
          v-if="!resume.isCurrent"
          label="Définir comme actuel"
          color="neutral"
          variant="outline"
          size="sm"
          @click="emit('setCurrent', resume)"
        />
        <UButton
          label="Critiquer"
          icon="i-lucide-sparkles"
          size="sm"
          :variant="resume.isCurrent ? 'solid' : 'soft'"
          :loading="reviewingId === resume.id"
          :disabled="Boolean(reviewingId) && reviewingId !== resume.id"
          :aria-label="`Critiquer « ${resume.title} »`"
          @click="emit('review', resume)"
        />
      </div>
    </li>
  </ul>
</template>
