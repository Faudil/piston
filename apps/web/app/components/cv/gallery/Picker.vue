<script setup lang="ts">
import type { CvContent, CvDesign, CvTemplateId } from '@piston/shared'

/**
 * The gallery in a dialog: « Changer de modèle » in the design tab, the
 * template step of « Créer mon CV ». Picking a template closes it.
 */
const open = defineModel<boolean>('open', { required: true })
const templateId = defineModel<CvTemplateId>('templateId', { required: true })
defineProps<{ design: CvDesign; content?: CvContent | null }>()
</script>

<template>
  <UModal
    v-model:open="open"
    title="Choisis un modèle"
    description="Aperçus avec ton CV, ou un exemple s’il est vide. Tes couleurs et polices sont conservées."
    :ui="{ content: 'sm:max-w-5xl' }"
  >
    <template #body>
      <CvGalleryGrid
        :model-value="templateId"
        :design="design"
        :content="content"
        :columns="4"
        @select="
          (id) => {
            templateId = id
            open = false
          }
        "
      />
    </template>
  </UModal>
</template>
