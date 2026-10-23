<script setup lang="ts">
import { cvSectionRef, type CvSectionColumn, type CvSectionConfig } from '@piston/shared'

/**
 * Frame of one CV section in the editor: a drag handle, its title with a
 * one-line summary (the card collapses to it), a visibility switch, a menu
 * (rename, column, move, delete) and a slot for its AI menu. Moving has
 * buttons as well as the drag, for the keyboard.
 */
const section = defineModel<CvSectionConfig>({ required: true })
const props = defineProps<{
  /** The title shown on the CV (custom, else default). */
  title: string
  /** What the rename field edits: the custom title, empty for « default ». */
  titleValue: string
  /** Title used when `titleValue` is empty; custom sections have none. */
  defaultTitle?: string
  summary: string
  index: number
  count: number
  /** Number of items, shown next to the title. */
  itemCount?: number
  /** Custom sections can be deleted. */
  deletable?: boolean
  /** Offer the column choice (two-column layouts). */
  showColumn?: boolean
}>()
const emit = defineEmits<{ move: [delta: number]; rename: [title: string]; remove: [] }>()

const sid = computed(() => cvSectionRef(section.value))
const expansion = useCvExpansion()
const open = computed(() => expansion.isOpen(sid.value))
const renaming = ref(false)

const COLUMNS: Array<{ value: CvSectionColumn; label: string }> = [
  { value: 'auto', label: 'Colonne selon le modèle' },
  { value: 'main', label: 'Colonne principale' },
  { value: 'side', label: 'Colonne latérale' },
]

const menu = computed(() => [
  [
    {
      label: 'Renommer',
      icon: 'i-lucide-pencil',
      onSelect: () => {
        renaming.value = true
        expansion.open(sid.value)
      },
    },
    {
      label: section.value.visible ? 'Masquer sur le CV' : 'Afficher sur le CV',
      icon: section.value.visible ? 'i-lucide-eye-off' : 'i-lucide-eye',
      onSelect: () => (section.value.visible = !section.value.visible),
    },
    {
      label: 'Monter',
      icon: 'i-lucide-arrow-up',
      disabled: props.index === 0,
      onSelect: () => emit('move', -1),
    },
    {
      label: 'Descendre',
      icon: 'i-lucide-arrow-down',
      disabled: props.index === props.count - 1,
      onSelect: () => emit('move', 1),
    },
  ],
  ...(props.showColumn
    ? [
        [
          { type: 'label' as const, label: 'Emplacement' },
          ...COLUMNS.map((column) => ({
            type: 'checkbox' as const,
            label: column.label,
            checked: section.value.column === column.value,
            onUpdateChecked: () => (section.value.column = column.value),
          })),
        ],
      ]
    : []),
  ...(props.deletable
    ? [
        [
          {
            label: 'Supprimer la section',
            icon: 'i-lucide-trash-2',
            color: 'error' as const,
            onSelect: () => emit('remove'),
          },
        ],
      ]
    : []),
])
</script>

<template>
  <section
    :id="`section-${sid}`"
    class="rounded-2xl border border-default bg-default shadow-xs"
    :class="{ 'opacity-70': !section.visible }"
    :aria-labelledby="`section-title-${sid}`"
  >
    <header
      class="flex items-center gap-1 px-2 py-2 sm:px-3"
      :class="{ 'border-b border-default': open }"
      :data-cv-id="`section.${sid}`"
    >
      <CvEditorsDragHandle level="section" />
      <h3 :id="`section-title-${sid}`" class="min-w-0 flex-1 font-semibold text-highlighted">
        <button
          type="button"
          class="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
          :aria-expanded="open"
          :aria-controls="`section-body-${sid}`"
          @click="expansion.toggle(sid)"
        >
          <UIcon
            :name="open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            class="size-4 shrink-0 text-muted"
          />
          <span class="min-w-0">
            <span class="flex items-center gap-2">
              <span class="truncate">{{ title }}</span>
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
              <UBadge
                v-if="showColumn && section.column !== 'auto'"
                :label="section.column === 'side' ? 'Latérale' : 'Principale'"
                color="neutral"
                variant="outline"
                size="sm"
              />
            </span>
            <span v-if="!open" class="block truncate text-xs font-normal text-muted">
              {{ summary }}
            </span>
          </span>
        </button>
      </h3>
      <slot name="actions" />
      <USwitch
        v-model="section.visible"
        size="sm"
        :aria-label="`Afficher « ${title} » sur le CV`"
        class="mx-1"
      />
      <UButton
        icon="i-lucide-arrow-up"
        color="neutral"
        variant="ghost"
        size="sm"
        class="hidden sm:inline-flex"
        data-section-move="up"
        :disabled="index === 0"
        :aria-label="`Monter la section « ${title} »`"
        @click="emit('move', -1)"
      />
      <UButton
        icon="i-lucide-arrow-down"
        color="neutral"
        variant="ghost"
        size="sm"
        class="hidden sm:inline-flex"
        data-section-move="down"
        :disabled="index === count - 1"
        :aria-label="`Descendre la section « ${title} »`"
        @click="emit('move', 1)"
      />
      <UDropdownMenu :items="menu" :content="{ align: 'end' }">
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="ghost"
          size="sm"
          data-section-menu
          :aria-label="`Plus d’actions pour la section « ${title} »`"
        />
      </UDropdownMenu>
    </header>
    <div v-if="open" :id="`section-body-${sid}`" class="space-y-4 p-4">
      <UFormField
        v-if="renaming"
        label="Titre de la section"
        :help="defaultTitle ? `Laisse vide pour « ${defaultTitle} ».` : undefined"
      >
        <UInput
          :model-value="titleValue"
          class="w-full"
          :maxlength="60"
          :placeholder="defaultTitle"
          autofocus
          @update:model-value="emit('rename', $event as string)"
          @keydown.enter.prevent="renaming = false"
          @blur="renaming = false"
        />
      </UFormField>
      <slot />
    </div>
  </section>
</template>
