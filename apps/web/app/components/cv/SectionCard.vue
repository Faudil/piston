<script setup lang="ts">
import { cvSectionTitles, type CvBuiltinSectionConfig, type CvLanguageCode } from '@piston/shared'

/**
 * Frame of one CV section in the editor: its title (custom or default), a
 * visibility switch, move up / down buttons and a slot for its AI menu.
 */
const section = defineModel<CvBuiltinSectionConfig>({ required: true })
const props = defineProps<{
  language: CvLanguageCode
  index: number
  count: number
  /** Number of items, shown next to the title. */
  itemCount?: number
}>()
const emit = defineEmits<{ move: [delta: number] }>()

const defaultTitle = computed(() => cvSectionTitles[props.language][section.value.key])
const shownTitle = computed(() => section.value.title.trim() || defaultTitle.value)
const renaming = ref(false)
</script>

<template>
  <section
    :id="`section-${section.key}`"
    class="rounded-2xl border border-default bg-default shadow-xs"
    :class="{ 'opacity-70': !section.visible }"
    :aria-labelledby="`section-title-${section.key}`"
  >
    <header class="flex flex-wrap items-center gap-2 border-b border-default px-4 py-3">
      <h3
        :id="`section-title-${section.key}`"
        class="flex min-w-0 flex-1 items-center gap-2 font-semibold text-highlighted"
      >
        <span class="truncate">{{ shownTitle }}</span>
        <UBadge
          v-if="itemCount !== undefined"
          :label="String(itemCount)"
          color="neutral"
          variant="subtle"
          size="sm"
        />
        <UBadge
          v-if="!section.visible"
          label="Masquée"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </h3>
      <div class="flex items-center gap-1">
        <slot name="actions" />
        <USwitch
          v-model="section.visible"
          size="sm"
          :aria-label="`Afficher « ${shownTitle} » sur le CV`"
          class="mx-1"
        />
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="`Renommer la section « ${shownTitle} »`"
          :aria-expanded="renaming"
          @click="renaming = !renaming"
        />
        <UButton
          icon="i-lucide-arrow-up"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="index === 0"
          :aria-label="`Monter la section « ${shownTitle} »`"
          @click="emit('move', -1)"
        />
        <UButton
          icon="i-lucide-arrow-down"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="index === count - 1"
          :aria-label="`Descendre la section « ${shownTitle} »`"
          @click="emit('move', 1)"
        />
      </div>
      <UFormField
        v-if="renaming"
        label="Titre de la section"
        :help="`Laisse vide pour « ${defaultTitle} ».`"
        class="w-full"
      >
        <UInput
          v-model="section.title"
          class="w-full"
          :maxlength="60"
          :placeholder="defaultTitle"
          autofocus
          @keydown.enter="renaming = false"
        />
      </UFormField>
    </header>
    <div class="p-4">
      <slot />
    </div>
  </section>
</template>
