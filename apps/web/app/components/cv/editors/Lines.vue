<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import { CV_LIMITS, newCvId, type CvExtra } from '@piston/shared'

/**
 * The « Informations complémentaires » section: free one-line entries
 * (« Permis B », « Mobilité nationale »), draggable, one input each.
 */
const lines = defineModel<CvExtra[]>({ required: true })
const list = useInPlaceList(() => lines.value)
const root = useTemplateRef<HTMLElement>('root')

async function add() {
  lines.value.push({ id: newCvId(), text: '' })
  await nextTick()
  root.value?.querySelector<HTMLInputElement>('li:last-child input')?.focus()
}

function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= lines.value.length) return
  const [line] = lines.value.splice(index, 1)
  lines.value.splice(target, 0, line!)
}
</script>

<template>
  <div ref="root" class="space-y-2">
    <p v-if="!lines.length" class="text-sm text-muted">{{ cvSectionEmptyHints.extras }}</p>
    <VueDraggable v-model="list" v-bind="cvDragOptions('item')" tag="ul" class="space-y-1.5">
      <li
        v-for="(line, index) in lines"
        :key="line.id"
        class="flex items-center gap-1"
        :data-cv-id="`item.${line.id}`"
      >
        <CvEditorsDragHandle level="item" />
        <UInput
          v-model="line.text"
          class="min-w-0 flex-1"
          :maxlength="CV_LIMITS.extraLine"
          :aria-label="`Information ${index + 1}`"
          placeholder="Ex. : Permis B, véhicule personnel"
          @keydown.enter.prevent="add"
        />
        <UButton
          icon="i-lucide-arrow-up"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="index === 0"
          :aria-label="`Monter l’information ${index + 1}`"
          @click="move(index, -1)"
        />
        <UButton
          icon="i-lucide-arrow-down"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="index === lines.length - 1"
          :aria-label="`Descendre l’information ${index + 1}`"
          @click="move(index, 1)"
        />
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="`Supprimer l’information ${index + 1}`"
          @click="lines.splice(index, 1)"
        />
      </li>
    </VueDraggable>
    <UButton
      v-if="lines.length < CV_LIMITS.extras"
      label="Ajouter une information"
      icon="i-lucide-plus"
      color="neutral"
      variant="outline"
      size="sm"
      @click="add"
    />
  </div>
</template>
