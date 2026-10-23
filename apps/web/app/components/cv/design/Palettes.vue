<script setup lang="ts">
import { contrastRatio, cvPalettes, type CvPalette } from '@piston/shared'

/**
 * Curated palettes and a custom accent color. A palette sets the three
 * palette overrides (primary, light companion, side column); the custom
 * color sets the primary only, the template derives the rest from it.
 */
const props = defineProps<{
  /** The resolved colors (override or template's). */
  primary: string
  secondary: string
  sidebarBg: string
}>()
const emit = defineEmits<{ palette: [palette: CvPalette]; primary: [color: string] }>()

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
// A palette is « active » when its primary color is the resolved one: templates derive
// their light colors differently, and the primary is what the eye recognizes.
const active = computed(() => cvPalettes.find((palette) => same(palette.primary, props.primary)))

// The hex field keeps what is typed; only a valid color is applied.
const hex = ref(props.primary)
watch(
  () => props.primary,
  (color) => (hex.value = color),
)
const HEX = /^#[0-9a-f]{6}$/i
const hexValid = computed(() => HEX.test(hex.value))
function commit(value: string) {
  hex.value = value
  if (HEX.test(value)) emit('primary', value.toLowerCase())
}

const lowContrast = computed(() => contrastRatio(props.primary, '#ffffff') < 4.5)
</script>

<template>
  <div class="space-y-4">
    <div
      role="radiogroup"
      aria-label="Palettes de couleurs"
      class="grid grid-cols-3 gap-2 sm:grid-cols-4"
    >
      <button
        v-for="palette in cvPalettes"
        :key="palette.id"
        type="button"
        role="radio"
        :aria-checked="active?.id === palette.id"
        :aria-label="palette.label"
        class="rounded-lg border p-1.5 text-left transition focus-visible:outline-2 focus-visible:outline-primary"
        :class="
          active?.id === palette.id
            ? 'border-primary ring-2 ring-primary/30'
            : 'border-default hover:border-accented'
        "
        @click="emit('palette', palette)"
      >
        <span class="flex h-7 overflow-hidden rounded-md ring-1 ring-default" aria-hidden="true">
          <span class="flex-1" :style="{ backgroundColor: palette.primary }" />
          <span class="w-1/4" :style="{ backgroundColor: palette.secondary }" />
          <span class="w-1/4" :style="{ backgroundColor: palette.sidebarBg }" />
        </span>
        <span class="mt-1 block truncate text-xs text-default">{{ palette.label }}</span>
      </button>
    </div>

    <div class="space-y-1.5">
      <label for="cv-custom-primary" class="text-sm font-medium text-highlighted">
        Couleur d’accent personnalisée
      </label>
      <div class="flex items-center gap-2">
        <input
          id="cv-custom-primary-picker"
          type="color"
          :value="primary"
          aria-label="Choisir la couleur d’accent"
          class="size-9 shrink-0 cursor-pointer rounded-md border border-default bg-transparent p-0.5"
          @input="commit(($event.target as HTMLInputElement).value)"
        />
        <UInput
          id="cv-custom-primary"
          :model-value="hex"
          maxlength="7"
          placeholder="#c8410b"
          spellcheck="false"
          autocomplete="off"
          class="w-32 font-mono"
          :color="hexValid ? 'neutral' : 'error'"
          :aria-invalid="!hexValid"
          aria-describedby="cv-custom-primary-help"
          @update:model-value="commit(String($event))"
        />
      </div>
      <p
        id="cv-custom-primary-help"
        class="text-xs"
        :class="hexValid ? 'text-muted' : 'text-error'"
      >
        <template v-if="!hexValid">Saisis une couleur au format #rrggbb.</template>
        <template v-else-if="lowContrast">
          Cette couleur est claire : le texte coloré est assombri pour rester lisible (contraste
          4,5:1 minimum).
        </template>
        <template v-else
          >Les couleurs claires associées sont calculées à partir de celle-ci.</template
        >
      </p>
    </div>
  </div>
</template>
