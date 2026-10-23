<script setup lang="ts">
import { CV_LIMITS, newCvId, type CvBullet } from '@piston/shared'

/**
 * The bullets of an experience or project: one textarea each, with move
 * up / down and delete buttons (keyboard and screen-reader friendly), and a
 * slot for the AI menu of each bullet.
 */
const bullets = defineModel<CvBullet[]>({ required: true })
const props = defineProps<{ itemLabel: string }>()

const list = ref<HTMLElement | null>(null)

async function add() {
  bullets.value.push({ id: newCvId(), text: '' })
  await nextTick()
  list.value?.querySelector<HTMLTextAreaElement>('li:last-child textarea')?.focus()
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
    <ol ref="list" class="space-y-2">
      <li v-for="(bullet, index) in bullets" :key="bullet.id" class="flex items-start gap-2">
        <span class="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        <div class="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start">
          <UTextarea
            v-model="bullet.text"
            :rows="1"
            autoresize
            :maxrows="6"
            class="min-w-0 flex-1"
            :maxlength="CV_LIMITS.bullet"
            :aria-label="`Puce ${index + 1} de « ${props.itemLabel} »`"
            placeholder="Un verbe d’action, ce que tu as fait, le résultat"
          />
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
    </ol>
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
