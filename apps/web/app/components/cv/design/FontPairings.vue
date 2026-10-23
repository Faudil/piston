<script setup lang="ts">
import { cvFontPairingIds, cvFontPairings, type CvFontPairingId } from '@piston/shared'

/**
 * The font pairings, each with a live sample in its real typefaces (the
 * CV's WOFF files, loaded with the FontFace API when this list opens).
 */
const props = defineProps<{ value: CvFontPairingId; sampleName: string; sampleTitle: string }>()
const emit = defineEmits<{ change: [id: CvFontPairingId] }>()

const ready = ref(false)
onMounted(() => {
  void loadCvFontSamples(cvFontPairingIds).then(() => (ready.value = true))
})

const style = (id: CvFontPairingId, part: 'heading' | 'body') => ({
  fontFamily: `${cvFontCssFamily(cvFontPairings[id][part])}, ${cvFontPairings[id].serif && part === 'heading' ? 'serif' : 'sans-serif'}`,
  opacity: ready.value ? 1 : 0.4,
})
const current = computed(() => props.value)
</script>

<template>
  <div role="radiogroup" aria-label="Polices du CV" class="grid gap-2 sm:grid-cols-2">
    <button
      v-for="id in cvFontPairingIds"
      :key="id"
      type="button"
      role="radio"
      :aria-checked="current === id"
      class="rounded-lg border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-primary"
      :class="
        current === id
          ? 'border-primary ring-2 ring-primary/30'
          : 'border-default hover:border-accented'
      "
      @click="emit('change', id)"
    >
      <span
        class="block text-lg font-bold leading-tight text-highlighted"
        :style="style(id, 'heading')"
      >
        {{ sampleName }}
      </span>
      <span class="block text-sm text-default" :style="style(id, 'body')">{{ sampleTitle }}</span>
      <span class="mt-1.5 block text-xs text-muted">
        {{ cvFontPairings[id].label }} · {{ cvFontPairings[id].description }}
      </span>
    </button>
  </div>
</template>
