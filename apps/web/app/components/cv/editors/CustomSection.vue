<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import {
  CV_LIMITS,
  createCvCustomItem,
  cvCustomFieldMaxLength,
  cvCustomItemFieldLabels,
  cvCustomItemFields,
  type CvCustomItem,
  type CvCustomItemField,
} from '@piston/shared'

/**
 * The items of a custom section (title, subtitle, date, text): one card
 * each, draggable by a handle, with the same move / delete buttons as the
 * built-in sections.
 */
const section = defineModel<{ id: string; title: string; items: CvCustomItem[] }>({
  required: true,
})

const expansion = useCvExpansion()
if (section.value.items.length <= 2) for (const item of section.value.items) expansion.open(item.id)

const model = useInPlaceList(() => section.value.items)
const root = useTemplateRef<HTMLElement>('root')

const PLACEHOLDERS: Partial<Record<CvCustomItemField, string>> = {
  date: 'MM/AAAA',
  subtitle: 'Lieu, organisme, rôle…',
}

const label = (item: CvCustomItem) => item.title.trim() || item.subtitle.trim() || 'Sans titre'

async function add() {
  const item = createCvCustomItem()
  section.value.items.push(item)
  expansion.open(item.id)
  await nextTick()
  root.value?.querySelector<HTMLElement>(`[data-cv-id="item.${item.id}"] input`)?.focus()
}

function move(index: number, delta: number) {
  const items = section.value.items
  const target = index + delta
  if (target < 0 || target >= items.length) return
  const [item] = items.splice(index, 1)
  items.splice(target, 0, item!)
}
</script>

<template>
  <div ref="root" class="space-y-3">
    <p
      v-if="!section.items.length"
      class="rounded-xl border border-dashed border-default p-4 text-sm text-muted"
    >
      {{ cvSectionEmptyHints.custom }}
    </p>
    <VueDraggable v-model="model" v-bind="cvDragOptions('item')" tag="ul" class="space-y-2">
      <li
        v-for="(item, index) in section.items"
        :key="item.id"
        class="rounded-xl border border-default bg-default"
        :data-cv-id="`item.${item.id}`"
      >
        <div class="flex items-center gap-1 p-2">
          <CvEditorsDragHandle level="item" />
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
            :aria-expanded="expansion.isOpen(item.id)"
            :aria-controls="`item-${item.id}`"
            @click="expansion.toggle(item.id)"
          >
            <UIcon
              :name="expansion.isOpen(item.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="size-4 shrink-0 text-muted"
            />
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-highlighted">{{
                label(item)
              }}</span>
              <span v-if="item.date" class="block truncate text-xs text-muted">{{
                item.date
              }}</span>
            </span>
          </button>
          <UButton
            icon="i-lucide-arrow-up"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="index === 0"
            :aria-label="`Monter « ${label(item)} »`"
            @click="move(index, -1)"
          />
          <UButton
            icon="i-lucide-arrow-down"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="index === section.items.length - 1"
            :aria-label="`Descendre « ${label(item)} »`"
            @click="move(index, 1)"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="`Supprimer « ${label(item)} »`"
            @click="section.items.splice(index, 1)"
          />
        </div>
        <div
          v-if="expansion.isOpen(item.id)"
          :id="`item-${item.id}`"
          class="grid grid-cols-2 gap-3 border-t border-default p-4"
        >
          <UFormField
            v-for="field in cvCustomItemFields"
            :key="field"
            :label="cvCustomItemFieldLabels[field]"
            :class="field === 'date' ? 'col-span-1' : 'col-span-2'"
            :hint="
              field === 'text' && item.text.length >= CV_LIMITS.customText * 0.7
                ? `${item.text.length}/${CV_LIMITS.customText}`
                : undefined
            "
          >
            <UTextarea
              v-if="field === 'text'"
              v-model="item[field]"
              class="w-full"
              :rows="2"
              autoresize
              :maxlength="cvCustomFieldMaxLength(field)"
            />
            <UInput
              v-else
              v-model="item[field]"
              class="w-full"
              :maxlength="cvCustomFieldMaxLength(field)"
              :placeholder="PLACEHOLDERS[field]"
            />
          </UFormField>
        </div>
      </li>
    </VueDraggable>
    <UButton
      v-if="section.items.length < CV_LIMITS.customItems"
      label="Ajouter un élément"
      icon="i-lucide-plus"
      color="neutral"
      variant="outline"
      size="sm"
      @click="add"
    />
  </div>
</template>
