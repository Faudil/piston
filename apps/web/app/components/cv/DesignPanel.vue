<script setup lang="ts">
import {
  CV_FONT_SIZE_STEPS,
  cvBulletStyleLabels,
  cvBulletStyles,
  cvDesignOverrideKeys,
  cvFontPairings,
  cvHeaderStyleLabels,
  cvHeaderStyles,
  cvItemStyleLabels,
  cvItemStyles,
  cvLanguageLabels,
  cvLanguageStyleLabels,
  cvLanguageStyles,
  cvLanguages,
  cvLayoutLabels,
  cvLayouts,
  cvLineHeightLabels,
  cvLineHeights,
  cvMarginLabels,
  cvMargins,
  cvPageFormatLabels,
  cvPageFormats,
  cvSectionTitleStyleLabels,
  cvSectionTitleStyles,
  cvSkillStyleLabels,
  cvSkillStyles,
  cvSpacingLabels,
  cvSpacings,
  cvTemplateCategoryLabels,
  cvTemplates,
  resetCvDesign,
  resolveCvDesign,
  type CvContent,
  type CvDesign,
  type CvPalette,
  type CvTemplateId,
} from '@piston/shared'

/**
 * The design studio: template, colors, fonts, text and spacing, layout and
 * styles, page. The design stores **overrides** of the template's tokens
 * (absent = the template's value): every control shows the resolved value,
 * says when it is overridden (« Modifié ») and can be reset on its own;
 * « Réinitialiser au modèle » clears all of them. Choosing the template's
 * own value clears the override, so « Modifié » always means « different ».
 */
const templateId = defineModel<CvTemplateId>('templateId', { required: true })
const design = defineModel<CvDesign>('design', { required: true })
const props = defineProps<{
  documentId: string
  /** Kept for the editor's call; thumbnails now come from the worker. */
  version?: string
  /** The document's content, for thumbnails of the user's own CV (fetched when absent). */
  content?: CvContent | null
}>()

const template = computed(() => cvTemplates[templateId.value])
const resolved = computed(() => resolveCvDesign(template.value, design.value))
const defaults = computed(() => template.value.defaults)

// --- Overrides -----------------------------------------------------------------------

type TokenKey = Exclude<(typeof cvDesignOverrideKeys)[number], 'palette'>

/** The template's value of a token, to compare with what the user picked. */
function templateValue(key: TokenKey): unknown {
  return defaults.value[key]
}

/** The design without one override (back to the template's value). */
function withoutOverride(current: CvDesign, key: TokenKey): CvDesign {
  return Object.fromEntries(Object.entries(current).filter(([name]) => name !== key)) as CvDesign
}

function setToken<K extends TokenKey>(key: K, value: NonNullable<CvDesign[K]>) {
  design.value =
    value === templateValue(key)
      ? withoutOverride(design.value, key)
      : { ...design.value, [key]: value }
}

function resetToken(key: TokenKey) {
  design.value = withoutOverride(design.value, key)
}

const isOverridden = (key: TokenKey) => design.value[key] !== undefined

const paletteOverridden = computed(() => Object.keys(design.value.palette).length > 0)
const overrideCount = computed(
  () =>
    cvDesignOverrideKeys.filter((key) =>
      key === 'palette' ? paletteOverridden.value : isOverridden(key),
    ).length,
)

function applyPalette(palette: CvPalette) {
  design.value = {
    ...design.value,
    palette: {
      ...design.value.palette,
      primary: palette.primary,
      secondary: palette.secondary,
      sidebarBg: palette.sidebarBg,
    },
  }
}
function setPrimary(color: string) {
  // A custom accent: the light colors follow it (the template derives them).
  const { secondary: _secondary, sidebarBg: _sidebarBg, ...rest } = design.value.palette
  design.value = { ...design.value, palette: { ...rest, primary: color } }
}
function resetPalette() {
  design.value = { ...design.value, palette: {} }
}
function resetAll() {
  design.value = resetCvDesign(design.value)
}

// --- Template gallery ---------------------------------------------------------------------

const galleryOpen = ref(false)
const fetchedContent = ref<CvContent | null>(null)
watch(galleryOpen, async (open) => {
  if (!open || props.content || fetchedContent.value) return
  try {
    const document = await $fetch<{ content: CvContent }>(`/api/cv-documents/${props.documentId}`)
    fetchedContent.value = document.content
  } catch {
    // Without the content, the thumbnails show the sample CV.
  }
})
const galleryContent = computed(() => props.content ?? fetchedContent.value)

// --- Items of the controls -----------------------------------------------------------------

const items = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }))

const fontSizeItems = Array.from(
  { length: CV_FONT_SIZE_STEPS.max - CV_FONT_SIZE_STEPS.min + 1 },
  (_, index) => {
    const value = CV_FONT_SIZE_STEPS.min + index
    return {
      value,
      label: value === 0 ? 'Normal' : value > 0 ? `+${value}` : `−${Math.abs(value)}`,
    }
  },
)
const languageItems = items(cvLanguages, cvLanguageLabels)

const sections = computed(() => [
  {
    value: 'colors',
    label: 'Couleurs',
    icon: 'i-lucide-palette',
    modified: paletteOverridden.value ? 1 : 0,
  },
  {
    value: 'fonts',
    label: 'Polices',
    icon: 'i-lucide-type',
    modified: Number(isOverridden('fontPairing')),
  },
  {
    value: 'text',
    label: 'Texte et espacement',
    icon: 'i-lucide-text-quote',
    modified: (['fontSize', 'lineHeight', 'spacing', 'margins'] as const).filter(isOverridden)
      .length,
  },
  {
    value: 'layout',
    label: 'Mise en page et styles',
    icon: 'i-lucide-layout-template',
    modified: (
      [
        'layout',
        'headerStyle',
        'sectionTitleStyle',
        'itemStyle',
        'bulletStyle',
        'skillStyle',
        'languageStyle',
        'showIcons',
      ] as const
    ).filter(isOverridden).length,
  },
  { value: 'page', label: 'Page et langue', icon: 'i-lucide-file-text', modified: 0 },
])
const open = ref<string[]>(['colors'])
</script>

<template>
  <div class="space-y-5">
    <!-- Template -->
    <section class="space-y-3" aria-labelledby="cv-design-template">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <h2 id="cv-design-template" class="text-sm font-semibold text-highlighted">Modèle</h2>
          <p class="mt-1 font-display text-lg font-semibold text-highlighted">
            {{ template.label }}
          </p>
          <p class="text-sm text-muted">
            {{ cvTemplateCategoryLabels[template.category] }} · {{ template.description }}
          </p>
        </div>
        <UButton
          label="Changer de modèle"
          icon="i-lucide-layout-grid"
          color="neutral"
          variant="outline"
          class="shrink-0"
          @click="galleryOpen = true"
        />
      </div>
      <UAlert
        v-if="template.atsNote"
        color="warning"
        variant="subtle"
        icon="i-lucide-shield-alert"
        :description="template.atsNote"
      />
      <div
        class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-2"
      >
        <p class="text-sm text-default" role="status">
          <template v-if="overrideCount">
            {{ overrideCount }} réglage{{ overrideCount > 1 ? 's' : '' }} modifié{{
              overrideCount > 1 ? 's' : ''
            }}
            par rapport au modèle.
          </template>
          <template v-else>Tous les réglages sont ceux du modèle.</template>
        </p>
        <UButton
          label="Réinitialiser au modèle"
          icon="i-lucide-rotate-ccw"
          size="sm"
          color="neutral"
          variant="outline"
          :disabled="!overrideCount"
          @click="resetAll"
        />
      </div>
    </section>

    <UAccordion
      v-model="open"
      type="multiple"
      :items="sections"
      :ui="{ trigger: 'text-base font-semibold' }"
    >
      <template #default="{ item }">
        {{ item.label }}
        <UBadge
          v-if="'modified' in item && item.modified"
          :label="`${item.modified} modifié${item.modified > 1 ? 's' : ''}`"
          color="primary"
          variant="subtle"
          size="sm"
          class="ml-2"
        />
      </template>

      <template #body="{ item }">
        <div v-if="item.value === 'colors'" class="space-y-3">
          <CvDesignPalettes
            :primary="resolved.palette.primary"
            :secondary="resolved.palette.secondary"
            :sidebar-bg="resolved.palette.sidebarBg"
            @palette="applyPalette"
            @primary="setPrimary"
          />
          <UButton
            v-if="paletteOverridden"
            label="Rétablir les couleurs du modèle"
            icon="i-lucide-rotate-ccw"
            size="xs"
            color="neutral"
            variant="link"
            @click="resetPalette"
          />
        </div>

        <div v-else-if="item.value === 'fonts'" class="space-y-3">
          <CvDesignFontPairings
            :value="resolved.fontPairing"
            sample-name="Léa Marchand"
            sample-title="Cheffe de projet digital · Lyon"
            @change="setToken('fontPairing', $event)"
          />
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs text-muted">
              Modèle : {{ cvFontPairings[defaults.fontPairing].label }}
            </p>
            <UButton
              v-if="isOverridden('fontPairing')"
              label="Rétablir"
              icon="i-lucide-rotate-ccw"
              size="xs"
              color="neutral"
              variant="link"
              @click="resetToken('fontPairing')"
            />
          </div>
        </div>

        <div v-else-if="item.value === 'text'" class="space-y-4">
          <CvDesignOptionGroup
            label="Taille du texte"
            :items="fontSizeItems"
            :value="resolved.fontSize"
            :overridden="isOverridden('fontSize')"
            @change="setToken('fontSize', $event)"
            @reset="resetToken('fontSize')"
          />
          <CvDesignOptionGroup
            label="Interligne"
            :items="items(cvLineHeights, cvLineHeightLabels)"
            :value="resolved.lineHeight"
            :overridden="isOverridden('lineHeight')"
            @change="setToken('lineHeight', $event)"
            @reset="resetToken('lineHeight')"
          />
          <CvDesignOptionGroup
            label="Espacement entre les blocs"
            :items="items(cvSpacings, cvSpacingLabels)"
            :value="resolved.spacing"
            :overridden="isOverridden('spacing')"
            @change="setToken('spacing', $event)"
            @reset="resetToken('spacing')"
          />
          <CvDesignOptionGroup
            label="Marges de la page"
            :items="items(cvMargins, cvMarginLabels)"
            :value="resolved.margins"
            :overridden="isOverridden('margins')"
            @change="setToken('margins', $event)"
            @reset="resetToken('margins')"
          />
        </div>

        <div v-else-if="item.value === 'layout'" class="space-y-4">
          <CvDesignOptionGroup
            label="Disposition"
            :items="items(cvLayouts, cvLayoutLabels)"
            :value="resolved.layout"
            :overridden="isOverridden('layout')"
            hint="Les rubriques d’une colonne latérale se choisissent dans l’éditeur."
            @change="setToken('layout', $event)"
            @reset="resetToken('layout')"
          />
          <CvDesignOptionGroup
            label="En-tête"
            :items="items(cvHeaderStyles, cvHeaderStyleLabels)"
            :value="resolved.headerStyle"
            :overridden="isOverridden('headerStyle')"
            @change="setToken('headerStyle', $event)"
            @reset="resetToken('headerStyle')"
          />
          <CvDesignOptionGroup
            label="Titres de rubrique"
            :items="items(cvSectionTitleStyles, cvSectionTitleStyleLabels)"
            :value="resolved.sectionTitleStyle"
            :overridden="isOverridden('sectionTitleStyle')"
            @change="setToken('sectionTitleStyle', $event)"
            @reset="resetToken('sectionTitleStyle')"
          />
          <CvDesignOptionGroup
            label="Expériences et formations"
            :items="items(cvItemStyles, cvItemStyleLabels)"
            :value="resolved.itemStyle"
            :overridden="isOverridden('itemStyle')"
            @change="setToken('itemStyle', $event)"
            @reset="resetToken('itemStyle')"
          />
          <CvDesignOptionGroup
            label="Puces"
            :items="items(cvBulletStyles, cvBulletStyleLabels)"
            :value="resolved.bulletStyle"
            :overridden="isOverridden('bulletStyle')"
            @change="setToken('bulletStyle', $event)"
            @reset="resetToken('bulletStyle')"
          />
          <CvDesignOptionGroup
            label="Compétences"
            :items="items(cvSkillStyles, cvSkillStyleLabels)"
            :value="resolved.skillStyle"
            :overridden="isOverridden('skillStyle')"
            hint="Les barres et points s’affichent pour les compétences qui ont un niveau."
            @change="setToken('skillStyle', $event)"
            @reset="resetToken('skillStyle')"
          />
          <CvDesignOptionGroup
            label="Langues"
            :items="items(cvLanguageStyles, cvLanguageStyleLabels)"
            :value="resolved.languageStyle"
            :overridden="isOverridden('languageStyle')"
            @change="setToken('languageStyle', $event)"
            @reset="resetToken('languageStyle')"
          />
          <div class="flex items-center justify-between gap-3">
            <USwitch
              :model-value="resolved.showIcons"
              label="Icônes"
              description="Devant les coordonnées et les titres de rubrique."
              @update:model-value="setToken('showIcons', $event)"
            />
            <UButton
              v-if="isOverridden('showIcons')"
              label="Rétablir"
              icon="i-lucide-rotate-ccw"
              size="xs"
              color="neutral"
              variant="link"
              aria-label="Rétablir les icônes au modèle"
              @click="resetToken('showIcons')"
            />
          </div>
        </div>

        <div v-else class="space-y-4">
          <CvDesignOptionGroup
            label="Format de page"
            :items="items(cvPageFormats, cvPageFormatLabels)"
            :value="design.pageFormat"
            :overridden="false"
            @change="design = { ...design, pageFormat: $event }"
          />
          <CvDesignOptionGroup
            label="Langue du CV"
            :items="languageItems"
            :value="design.language"
            :overridden="false"
            hint="Titres des rubriques, « Aujourd’hui » et niveaux de langue."
            @change="design = { ...design, language: $event }"
          />
        </div>
      </template>
    </UAccordion>

    <CvGalleryPicker
      v-model:open="galleryOpen"
      v-model:template-id="templateId"
      :design="design"
      :content="galleryContent"
    />
  </div>
</template>
