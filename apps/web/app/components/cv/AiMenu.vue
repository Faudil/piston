<script setup lang="ts">
import { cvAiActionLabels, cvAiActions, type CvAiAction, type CvEditScope } from '@piston/shared'

/**
 * The « IA » menu of a section, an item or a bullet: the inline actions
 * (« Plus percutant », « Chiffrer »...), limited to that part of the CV. The
 * request goes to the editor page, which shows the proposal in the AI panel.
 */
const props = defineProps<{
  scope: CvEditScope
  /** What the scope is, for the accessible name and the revision label (« la puce »). */
  label: string
}>()

const requestEdit = inject(CV_AI_REQUEST)

const items = computed(() => [
  cvAiActions
    // Translating one bullet into English rarely makes sense on its own.
    .filter((action: CvAiAction) => action !== 'translate_en' || !props.scope.bulletId)
    .map((action) => ({
      label: cvAiActionLabels[action].label,
      icon: cvAiActionLabels[action].icon,
      onSelect: () =>
        requestEdit?.(
          { mode: 'action', action, scope: props.scope },
          `IA : ${cvAiActionLabels[action].label.toLowerCase()} (${props.label})`,
        ),
    })),
])
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton
      icon="i-lucide-sparkles"
      color="primary"
      variant="ghost"
      size="sm"
      :aria-label="`Actions de Claude sur ${label}`"
    />
  </UDropdownMenu>
</template>
