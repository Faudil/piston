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
 * selection, Tab leaves the group. « Personnalisé » opens a field for the
 * structure the user wants; left empty, Claude chooses.
 */
const template = defineModel<CoverLetterTemplate>({ required: true })
const customStructure = defineModel<string>('customStructure', { required: true })
defineProps<{ disabled?: boolean }>()

const items = coverLetterTemplates.map((value) => ({
  value,
  label: coverLetterTemplateLabels[value],
  description: coverLetterTemplateDescriptions[value],
}))
</script>

<template>
  <div class="space-y-3">
    <URadioGroup
      v-model="template"
      legend="Modèle de lettre"
      :items="items"
      :disabled="disabled"
      variant="card"
      :ui="{ fieldset: 'grid gap-2 sm:grid-cols-2' }"
    />
    <UFormField
      v-if="template === 'personnalise'"
      label="Ta structure"
      hint="Facultatif"
      help="Laisse vide : Claude choisit la structure la plus adaptée à l’offre et à ton CV."
    >
      <UTextarea
        v-model="customStructure"
        :rows="2"
        autoresize
        :maxlength="1000"
        :disabled="disabled"
        class="w-full"
        placeholder="Ex. : trois paragraphes courts, une accroche sur mon projet open source…"
      />
    </UFormField>
  </div>
</template>
