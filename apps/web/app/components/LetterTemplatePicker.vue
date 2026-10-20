<script setup lang="ts">
import {
  coverLetterTemplateDescriptions,
  coverLetterTemplateLabels,
  coverLetterTemplates,
  type CoverLetterTemplate,
} from '@piston/shared'

/**
 * Choice of the letter structure, as radio cards (label + one-line
 * description). URadioGroup is a real radio group: arrow keys move the
 * selection, Tab leaves the group.
 */
const template = defineModel<CoverLetterTemplate>({ required: true })
defineProps<{ disabled?: boolean }>()

const items = coverLetterTemplates.map((value) => ({
  value,
  label: coverLetterTemplateLabels[value],
  description: coverLetterTemplateDescriptions[value],
}))
</script>

<template>
  <URadioGroup
    v-model="template"
    legend="Modèle de lettre"
    :items="items"
    :disabled="disabled"
    variant="card"
    :ui="{ fieldset: 'grid gap-2 sm:grid-cols-2' }"
  />
</template>
