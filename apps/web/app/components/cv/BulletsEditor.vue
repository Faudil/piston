<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import { CV_LIMITS, newCvId, type CvBullet } from '@piston/shared'

/**
 * The bullets of an experience or project: one textarea each, draggable by
 * a handle, with move up / down and delete buttons (keyboard and
 * screen-reader friendly), and a slot for the AI menu of each bullet.
 */
const bullets = defineModel<CvBullet[]>({ required: true })
const props = defineProps<{ itemLabel: string }>()

const model = useInPlaceList(() => bullets.value)
/** The counter appears when the limit is near, so short bullets stay uncluttered. */
const nearLimit = (text: string) => text.length >= CV_LIMITS.bullet * 0.7

async function add() {
  bullets.value.push({ id: newCvId(), text: '' })
  await nextTick()
  document
    .querySelector<HTMLElement>(`[data-cv-id="bullet.${bullets.value.at(-1)!.id}"] textarea`)
    ?.focus()
}

function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= bullets.value.length) return
  const [bullet] = bullets.value.splice(index, 1)
  bullets.value.splice(target, 0, bullet!)
}

function remove(index: number) {
  bullets.value.splice(index, 1)
}
</script>

<template>
  <fieldset class="space-y-2">
    <legend class="mb-1 text-sm font-medium text-highlighted">Puces</legend>
    <p v-if="!bullets.length" class="text-sm text-muted">
      Une puce = une réalisation : un verbe d’action, ce que tu as fait, le résultat.
    </p>
    <VueDraggable v-model="model" v-bind="cvDragOptions('inner')" tag="ol" class="space-y-2">
      <li
        v-for="(bullet, index) in bullets"
        :key="bullet.id"
        class="flex items-start gap-1"
        :data-cv-id="`bullet.${bullet.id}`"
      >
        <CvEditorsDragHandle level="inner" class="mt-0.5" />
        <div class="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start">
          <div class="min-w-0 flex-1">
            <UTextarea
              v-model="bullet.text"
              :rows="1"
              autoresize
              :maxrows="6"
              class="w-full"
              :maxlength="CV_LIMITS.bullet"
              :aria-label="`Puce ${index + 1} de « ${props.itemLabel} »`"
              placeholder="Un verbe d’action, ce que tu as fait, le résultat"
            />
            <p v-if="nearLimit(bullet.text)" class="mt-0.5 text-right text-xs text-muted">
              {{ bullet.text.length }}/{{ CV_LIMITS.bullet }}
            </p>
          </div>
          <div class="flex shrink-0 items-center justify-end">
            <slot name="actions" :bullet="bullet" :index="index" />
            <UButton
              icon="i-lucide-arrow-up"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="index === 0"
              :aria-label="`Monter la puce ${index + 1}`"
              @click="move(index, -1)"
            />
            <UButton
              icon="i-lucide-arrow-down"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="index === bullets.length - 1"
              :aria-label="`Descendre la puce ${index + 1}`"
              @click="move(index, 1)"
            />
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`Supprimer la puce ${index + 1}`"
              @click="remove(index)"
            />
          </div>
        </div>
      </li>
    </VueDraggable>
    <UButton
      v-if="bullets.length < CV_LIMITS.bullets"
      label="Ajouter une puce"
      icon="i-lucide-plus"
      color="neutral"
      variant="ghost"
      size="sm"
      @click="add"
    />
  </fieldset>
</template>
