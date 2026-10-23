<script setup lang="ts">
import { CV_LIMITS, type CvContent, type CvItem, type CvLanguageCode } from '@piston/shared'

/** Every editable part of a CV document: the header, then the sections in their order. */
const content = defineModel<CvContent>({ required: true })
defineProps<{ language: CvLanguageCode }>()

function moveSection(index: number, delta: number) {
  const target = index + delta
  const sections = content.value.sections
  if (target < 0 || target >= sections.length) return
  const [section] = sections.splice(index, 1)
  sections.splice(target, 0, section!)
  // Keep the keyboard focus on the moved section.
  void nextTick(() =>
    document
      .querySelector<HTMLElement>(
        `#section-${section!.key} button[aria-label^="${delta < 0 ? 'Monter' : 'Descendre'} la section"]`,
      )
      ?.focus(),
  )
}

const listOf = (key: Exclude<CvContent['sections'][number]['key'], 'summary'>) =>
  content.value[key] as CvItem[]
</script>

<template>
  <div class="space-y-4">
    <section
      class="rounded-2xl border border-default bg-default shadow-xs"
      aria-labelledby="section-title-header"
    >
      <header class="flex items-center gap-2 border-b border-default px-4 py-3">
        <h3 id="section-title-header" class="flex-1 font-semibold text-highlighted">En-tête</h3>
        <slot name="header-actions" />
      </header>
      <div class="p-4">
        <CvHeaderEditor v-model="content.header" />
      </div>
    </section>

    <CvSectionCard
      v-for="(section, index) in content.sections"
      :key="section.key"
      v-model="content.sections[index]!"
      :language="language"
      :index="index"
      :count="content.sections.length"
      :item-count="section.key === 'summary' ? undefined : listOf(section.key).length"
      @move="moveSection(index, $event)"
    >
      <template #actions>
        <slot name="section-actions" :section="section.key" />
      </template>

      <UFormField
        v-if="section.key === 'summary'"
        label="Accroche"
        :hint="`${content.summary.length}/${CV_LIMITS.summary}`"
        help="3 ou 4 lignes : qui tu es, ce que tu sais faire, ce que tu cherches."
      >
        <UTextarea
          v-model="content.summary"
          class="w-full"
          :rows="3"
          autoresize
          :maxlength="CV_LIMITS.summary"
        />
      </UFormField>
      <CvItemsEditor v-else :model-value="listOf(section.key)" :section="section.key">
        <template #item-actions="{ item }">
          <slot name="item-actions" :section="section.key" :item="item" />
        </template>
        <template #bullet-actions="{ item, bullet }">
          <slot name="bullet-actions" :section="section.key" :item="item" :bullet="bullet" />
        </template>
      </CvItemsEditor>
    </CvSectionCard>
  </div>
</template>
