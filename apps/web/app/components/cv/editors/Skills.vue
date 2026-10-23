<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import { CV_LIMITS, newCvId, type CvSkill } from '@piston/shared'

/**
 * The skills of one group: a row each with its name, a 0–5 level and a
 * delete button, draggable to reorder (up / down buttons for the keyboard).
 * New skills are typed in the field below the list: Enter or a comma adds.
 */
const skills = defineModel<CvSkill[]>({ required: true })
const props = defineProps<{
  groupLabel: string
  /** Whether the current skill style draws levels (bars or dots). */
  levelsDrawn: boolean
}>()

const list = useInPlaceList(() => skills.value)
const draft = ref('')
const full = computed(() => skills.value.length >= CV_LIMITS.skillItems)

function addNames(names: string[]) {
  for (const name of names.map((entry) => entry.trim()).filter(Boolean)) {
    if (skills.value.length >= CV_LIMITS.skillItems) break
    skills.value.push({ id: newCvId(), name: name.slice(0, CV_LIMITS.skillItem), level: 0 })
  }
}

// A comma (typed or pasted in a list) adds everything before it.
watch(draft, (value) => {
  if (!value.includes(',')) return
  const parts = value.split(',')
  draft.value = parts.pop() ?? ''
  addNames(parts)
})

function commit() {
  addNames([draft.value])
  draft.value = ''
}

function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= skills.value.length) return
  const [skill] = skills.value.splice(index, 1)
  skills.value.splice(target, 0, skill!)
}

const hasLevels = computed(() => skills.value.some((skill) => skill.level > 0))
</script>

<template>
  <div class="space-y-2">
    <p class="text-sm font-medium text-highlighted">
      Compétences
      <span class="font-normal text-muted">({{ skills.length }}/{{ CV_LIMITS.skillItems }})</span>
    </p>
    <VueDraggable v-model="list" v-bind="cvDragOptions('inner')" tag="ul" class="space-y-1.5">
      <li
        v-for="(skill, index) in skills"
        :key="skill.id"
        class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-default bg-default p-1.5"
        :data-cv-id="`skill.${skill.id}`"
      >
        <CvEditorsDragHandle level="inner" />
        <UInput
          v-model="skill.name"
          class="min-w-0 flex-1 basis-40"
          :maxlength="CV_LIMITS.skillItem"
          :aria-label="`Compétence ${index + 1} de « ${props.groupLabel} »`"
        />
        <CvEditorsRating v-model="skill.level" :label="skill.name || `compétence ${index + 1}`" />
        <div class="ml-auto flex items-center">
          <UButton
            icon="i-lucide-arrow-up"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="index === 0"
            :aria-label="`Monter la compétence ${skill.name || index + 1}`"
            @click="move(index, -1)"
          />
          <UButton
            icon="i-lucide-arrow-down"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="index === skills.length - 1"
            :aria-label="`Descendre la compétence ${skill.name || index + 1}`"
            @click="move(index, 1)"
          />
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="`Supprimer la compétence ${skill.name || index + 1}`"
            @click="skills.splice(index, 1)"
          />
        </div>
      </li>
    </VueDraggable>
    <UInput
      v-model="draft"
      class="w-full"
      :disabled="full"
      :maxlength="CV_LIMITS.skillItem"
      placeholder="Ajouter une compétence (Entrée, ou une liste séparée par des virgules)"
      aria-label="Ajouter une compétence"
      @keydown.enter.prevent="commit"
      @blur="commit"
    />
    <p v-if="!levelsDrawn" class="text-xs text-muted">
      <UIcon name="i-lucide-info" class="mr-1 inline size-3.5 align-text-bottom" />
      <template v-if="hasLevels"
        >Ces niveaux ne s’affichent pas avec le style de compétences actuel.</template
      >
      <template v-else>Les niveaux sont facultatifs.</template>
      Ils sont dessinés avec les styles « barres » ou « points » (onglet Design).
    </p>
  </div>
</template>
