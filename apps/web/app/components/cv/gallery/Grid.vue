<script setup lang="ts">
import {
  cvAtsLevelLabels,
  cvTemplateCategories,
  cvTemplateCategoryLabels,
  cvTemplateIds,
  cvTemplates,
  type CvAtsLevel,
  type CvContent,
  type CvDesign,
  type CvTemplateCategory,
  type CvTemplateId,
} from '@piston/shared'

/**
 * The template gallery: real thumbnails (the sample CV, then the user's own
 * content when `content` is given), category filters, an ATS badge and a
 * « Utiliser ce modèle » button on every card. `design` holds the user's
 * overrides, so each thumbnail shows the template with their colors and fonts.
 */
const selected = defineModel<CvTemplateId | null>({ default: null })
const props = withDefaults(
  defineProps<{
    design: CvDesign
    content?: CvContent | null
    /** Columns on wide screens (the design tab is narrow: 2). */
    columns?: 2 | 3 | 4
  }>(),
  { content: null, columns: 3 },
)
const emit = defineEmits<{ select: [id: CvTemplateId] }>()

type Filter = CvTemplateCategory | 'all'
const filter = ref<Filter>('all')
const filters = computed(() => [
  { id: 'all' as const, label: 'Tous', count: cvTemplateIds.length },
  ...cvTemplateCategories.map((id) => ({
    id,
    label: cvTemplateCategoryLabels[id],
    count: cvTemplateIds.filter((templateId) => cvTemplates[templateId].category === id).length,
  })),
])
const shown = computed(() =>
  cvTemplateIds.filter((id) => filter.value === 'all' || cvTemplates[id].category === filter.value),
)

const ATS_BADGE: Record<
  CvAtsLevel,
  { label: string; color: 'success' | 'neutral' | 'warning'; icon: string }
> = {
  optimal: { label: 'ATS optimal', color: 'success', icon: 'i-lucide-shield-check' },
  bon: { label: 'ATS bon', color: 'neutral', icon: 'i-lucide-shield' },
  limite: { label: 'ATS à risque', color: 'warning', icon: 'i-lucide-shield-alert' },
}

function choose(id: CvTemplateId) {
  selected.value = id
  emit('select', id)
}

const gridClass = computed(
  () =>
    ({
      2: 'grid-cols-2',
      3: 'grid-cols-2 md:grid-cols-3',
      4: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4',
    })[props.columns],
)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap gap-2" role="group" aria-label="Filtrer les modèles par catégorie">
      <UButton
        v-for="item in filters"
        :key="item.id"
        :label="`${item.label} (${item.count})`"
        size="sm"
        :variant="filter === item.id ? 'solid' : 'outline'"
        :color="filter === item.id ? 'primary' : 'neutral'"
        :aria-pressed="filter === item.id"
        @click="filter = item.id"
      />
    </div>

    <ul class="grid gap-4" :class="gridClass">
      <li
        v-for="id in shown"
        :key="id"
        class="relative flex flex-col gap-2 rounded-xl border p-2.5 transition focus-within:ring-2 focus-within:ring-primary"
        :class="
          selected === id
            ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
            : 'border-default hover:border-accented'
        "
      >
        <CvGalleryThumbnail
          :template-id="id"
          :design="design"
          :content="content"
          :label="`Aperçu du modèle ${cvTemplates[id].label}`"
        />
        <div class="min-w-0 space-y-1">
          <p class="flex items-center gap-1 font-medium text-highlighted">
            <UIcon v-if="selected === id" name="i-lucide-check" class="size-4 text-primary" />
            {{ cvTemplates[id].label }}
          </p>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-xs text-muted">
              {{ cvTemplateCategoryLabels[cvTemplates[id].category] }}
            </span>
            <span
              v-if="cvTemplates[id].photo === 'feature'"
              class="inline-flex items-center gap-1 text-xs text-muted"
            >
              <UIcon name="i-lucide-image" class="size-3.5" aria-hidden="true" />
              Pensé pour une photo
            </span>
            <UBadge
              :label="ATS_BADGE[cvTemplates[id].atsLevel].label"
              :color="ATS_BADGE[cvTemplates[id].atsLevel].color"
              :icon="ATS_BADGE[cvTemplates[id].atsLevel].icon"
              variant="subtle"
              size="sm"
              :title="cvTemplates[id].atsNote ?? cvAtsLevelLabels[cvTemplates[id].atsLevel]"
            />
          </div>
        </div>
        <p class="text-xs text-muted">{{ cvTemplates[id].description }}</p>
        <!-- The button stretches over the whole card: one control per template. -->
        <UButton
          :label="selected === id ? 'Modèle choisi' : 'Utiliser ce modèle'"
          :aria-label="`Utiliser le modèle ${cvTemplates[id].label}`"
          :aria-pressed="selected === id"
          :variant="selected === id ? 'soft' : 'outline'"
          size="sm"
          block
          class="mt-auto after:absolute after:inset-0 after:content-['']"
          @click="choose(id)"
        />
      </li>
    </ul>
  </div>
</template>
