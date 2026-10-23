<script setup lang="ts">
import {
  cvAccentPresets,
  cvFontPairingIds,
  cvFontPairings,
  cvLanguageLabels,
  cvLanguages,
  cvSpacingLabels,
  cvSpacings,
  cvTemplateIds,
  cvTemplates,
  resolveCvDesign,
  type CvDesign,
  type CvTemplateId,
} from '@piston/shared'

/**
 * Template gallery and design options. Thumbnails are the user's own CV
 * rendered by each template (the server's PDF), loaded only when the panel
 * is shown. The design stores overrides of the template's tokens: a control
 * shows the resolved value and writes an override.
 */
const templateId = defineModel<CvTemplateId>('templateId', { required: true })
const design = defineModel<CvDesign>('design', { required: true })
const props = defineProps<{ documentId: string; version: string }>()

// Thumbnails show the document as it was when the panel opened: re-rendering
// three PDFs on every autosave would cost more than it shows.
const thumbnailVersion = props.version

const resolved = computed(() => resolveCvDesign(cvTemplates[templateId.value], design.value))
const fontItems = cvFontPairingIds.map((value) => ({ value, label: cvFontPairings[value].label }))
const spacingItems = cvSpacings.map((value) => ({ value, label: cvSpacingLabels[value] }))
const accent = computed(() => resolved.value.palette.primary.toLowerCase())
const languageItems = cvLanguages.map((value) => ({ value, label: cvLanguageLabels[value] }))
</script>

<template>
  <div class="space-y-8">
    <fieldset>
      <legend class="mb-3 text-sm font-semibold text-highlighted">Modèle</legend>
      <div class="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Modèle du CV">
        <button
          v-for="id in cvTemplateIds"
          :key="id"
          type="button"
          role="radio"
          :aria-checked="templateId === id"
          class="group rounded-xl border p-2 text-left transition focus-visible:outline-2 focus-visible:outline-primary"
          :class="
            templateId === id
              ? 'border-primary ring-2 ring-primary/30'
              : 'border-default hover:border-accented'
          "
          @click="templateId = id"
        >
          <ClientOnly>
            <CvPdfPreview
              :src="`/api/cv-documents/${documentId}/pdf?templateId=${id}&v=${thumbnailVersion}`"
              :max-pages="1"
              :label="`Aperçu du modèle ${cvTemplates[id].label}`"
            />
          </ClientOnly>
          <span class="mt-2 flex items-center gap-1 text-sm font-medium text-highlighted">
            <UIcon v-if="templateId === id" name="i-lucide-check" class="size-4 text-primary" />
            {{ cvTemplates[id].label }}
          </span>
        </button>
      </div>
      <p class="mt-3 text-sm text-muted">{{ cvTemplates[templateId].description }}</p>
    </fieldset>

    <fieldset>
      <legend class="mb-3 text-sm font-semibold text-highlighted">Couleur d’accent</legend>
      <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Couleur d’accent">
        <button
          v-for="preset in cvAccentPresets"
          :key="preset.value"
          type="button"
          role="radio"
          :aria-checked="accent === preset.value"
          :aria-label="preset.label"
          :title="preset.label"
          class="grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-default focus-visible:outline-2 focus-visible:outline-primary"
          :class="accent === preset.value ? 'ring-2 ring-default' : ''"
          :style="{ backgroundColor: preset.value }"
          @click="design.palette = { ...design.palette, primary: preset.value }"
        >
          <UIcon v-if="accent === preset.value" name="i-lucide-check" class="size-4 text-white" />
        </button>
      </div>
    </fieldset>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Polices">
        <USelect
          :model-value="resolved.fontPairing"
          :items="fontItems"
          class="w-full"
          @update:model-value="design.fontPairing = $event"
        />
      </UFormField>
      <UFormField label="Langue du CV" help="Titres des sections et « Aujourd’hui ».">
        <USelect v-model="design.language" :items="languageItems" class="w-full" />
      </UFormField>
      <UFormField label="Espacement" class="sm:col-span-2">
        <URadioGroup
          :model-value="resolved.spacing"
          :items="spacingItems"
          orientation="horizontal"
          variant="card"
          @update:model-value="design.spacing = $event as CvDesign['spacing']"
        />
      </UFormField>
    </div>
  </div>
</template>
