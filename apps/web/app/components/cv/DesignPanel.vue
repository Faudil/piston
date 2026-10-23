<script setup lang="ts">
import {
  cvAccentPresets,
  cvDensities,
  cvDensityLabels,
  cvFontLabels,
  cvFonts,
  cvLanguageLabels,
  cvLanguages,
  cvTemplateIds,
  cvTemplates,
  type CvDesign,
  type CvTemplateId,
} from '@piston/shared'

/**
 * Template gallery and design options. Thumbnails are the user's own CV
 * rendered by each template (the same PDF as the preview), loaded only when
 * the panel is shown.
 */
const templateId = defineModel<CvTemplateId>('templateId', { required: true })
const design = defineModel<CvDesign>('design', { required: true })
const props = defineProps<{ documentId: string; version: string }>()

// Thumbnails show the document as it was when the panel opened: re-rendering
// three PDFs on every autosave would cost more than it shows.
const thumbnailVersion = props.version

const fontItems = cvFonts.map((value) => ({ value, label: cvFontLabels[value] }))
const densityItems = cvDensities.map((value) => ({ value, label: cvDensityLabels[value] }))
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
          :aria-checked="design.accentColor.toLowerCase() === preset.value"
          :aria-label="preset.label"
          :title="preset.label"
          class="grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-default focus-visible:outline-2 focus-visible:outline-primary"
          :class="design.accentColor.toLowerCase() === preset.value ? 'ring-2 ring-default' : ''"
          :style="{ backgroundColor: preset.value }"
          @click="design.accentColor = preset.value"
        >
          <UIcon
            v-if="design.accentColor.toLowerCase() === preset.value"
            name="i-lucide-check"
            class="size-4 text-white"
          />
        </button>
      </div>
    </fieldset>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Police">
        <USelect v-model="design.font" :items="fontItems" class="w-full" />
      </UFormField>
      <UFormField label="Langue du CV" help="Titres des sections et « Aujourd’hui ».">
        <USelect v-model="design.language" :items="languageItems" class="w-full" />
      </UFormField>
      <UFormField label="Densité" class="sm:col-span-2">
        <URadioGroup
          v-model="design.density"
          :items="densityItems"
          orientation="horizontal"
          variant="card"
        />
      </UFormField>
    </div>
  </div>
</template>
