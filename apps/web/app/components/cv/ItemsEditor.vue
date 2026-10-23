<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import {
  createCvItem,
  cvCefrLabels,
  cvCefrLevels,
  cvFieldLabels,
  cvFieldMaxLength,
  cvItemLabel,
  cvItemTextFields,
  cvSectionMaxItems,
  formatCvDateRange,
  type CvBullet,
  type CvCefr,
  type CvItem,
  type CvListSectionKey,
  type CvSkill,
} from '@piston/shared'

/**
 * The items of a list section (experiences, education, skills...): one
 * collapsible card per item with its fields, its bullets or its skills,
 * draggable by a handle, with buttons to move or delete it (the keyboard
 * equivalents of the drag). Slots let the parent add AI menus.
 */
const items = defineModel<CvItem[]>({ required: true })
const props = defineProps<{
  section: CvListSectionKey
  /** Whether the skill style in use draws skill levels (bars or dots). */
  skillLevelsDrawn?: boolean
}>()

const ADD_LABELS: Record<CvListSectionKey, string> = {
  experiences: 'Ajouter une expérience',
  education: 'Ajouter une formation',
  skills: 'Ajouter un groupe de compétences',
  languages: 'Ajouter une langue',
  projects: 'Ajouter un projet',
  certifications: 'Ajouter une certification',
  interests: 'Ajouter un centre d’intérêt',
  volunteering: 'Ajouter un engagement bénévole',
  awards: 'Ajouter un prix ou une distinction',
  publications: 'Ajouter une publication',
  references: 'Ajouter une référence',
  extras: 'Ajouter une information',
}

const PLACEHOLDERS: Record<string, string> = {
  start: 'MM/AAAA',
  end: 'MM/AAAA ou Aujourd’hui',
  date: 'MM/AAAA',
  url: 'https://…',
  level: 'Ex. : courant, bilingue',
}

/** Short fields share a row on phones too. */
const HALF_WIDTH = new Set(['start', 'end', 'date', 'level', 'location'])

const fields = computed(() =>
  (cvItemTextFields[props.section] as readonly string[]).map((field) => ({
    field,
    label: (cvFieldLabels[props.section] as Record<string, string>)[field] ?? field,
    max: cvFieldMaxLength(field),
    textarea: field === 'details',
  })),
)
const hasBullets = computed(
  () =>
    props.section === 'experiences' ||
    props.section === 'projects' ||
    props.section === 'volunteering',
)
const max = computed(() => cvSectionMaxItems[props.section])

const expansion = useCvExpansion()
// Only one or two items: show them open; otherwise open on demand.
if (items.value.length <= 2) for (const item of items.value) expansion.open(item.id)

const model = useInPlaceList(() => items.value)
const root = useTemplateRef<HTMLElement>('root')

async function add() {
  const item = createCvItem(props.section) as CvItem
  items.value.push(item)
  expansion.open(item.id)
  await nextTick()
  root.value
    ?.querySelector<HTMLElement>(
      `[data-cv-id="item.${item.id}"] input, [data-cv-id="item.${item.id}"] textarea`,
    )
    ?.focus()
}

function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= items.value.length) return
  const [item] = items.value.splice(index, 1)
  items.value.splice(target, 0, item!)
}

function remove(index: number) {
  items.value.splice(index, 1)
}

const record = (item: CvItem) => item as unknown as Record<string, string>
const bulletsOf = (item: CvItem) => (item as unknown as { bullets: CvBullet[] }).bullets
const skillsOf = (item: CvItem) => item as unknown as { items: CvSkill[] }
const languageOf = (item: CvItem) => item as unknown as { cefr: CvCefr | null }

const cefrOptions = [
  { label: 'Niveau non précisé', value: 'none' },
  ...cvCefrLevels.map((level) => ({ label: cvCefrLabels[level], value: level })),
]

function setCefr(item: CvItem, value: string) {
  languageOf(item).cefr = value === 'none' ? null : (value as CvCefr)
}

function dates(item: CvItem) {
  const value = record(item)
  return formatCvDateRange(value.start ?? value.date ?? '', value.end ?? '', 'fr')
}
</script>

<template>
  <div ref="root" class="space-y-3">
    <p
      v-if="!items.length"
      class="rounded-xl border border-dashed border-default p-4 text-sm text-muted"
    >
      {{ cvSectionEmptyHints[section] }}
    </p>
    <VueDraggable v-model="model" v-bind="cvDragOptions('item')" tag="ul" class="space-y-2">
      <li
        v-for="(item, index) in items"
        :key="item.id"
        class="rounded-xl border border-default bg-default"
        :data-item-id="item.id"
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
              <span class="block truncate text-sm font-medium text-highlighted">
                {{ cvItemLabel(section, item) }}
              </span>
              <span v-if="dates(item)" class="block truncate text-xs text-muted">
                {{ dates(item) }}
              </span>
            </span>
          </button>
          <slot name="item-actions" :item="item" />
          <UButton
            icon="i-lucide-arrow-up"
            color="neutral"
            variant="ghost"
            size="sm"
            class="hidden sm:inline-flex"
            :disabled="index === 0"
            :aria-label="`Monter « ${cvItemLabel(section, item)} »`"
            @click="move(index, -1)"
          />
          <UButton
            icon="i-lucide-arrow-down"
            color="neutral"
            variant="ghost"
            size="sm"
            class="hidden sm:inline-flex"
            :disabled="index === items.length - 1"
            :aria-label="`Descendre « ${cvItemLabel(section, item)} »`"
            @click="move(index, 1)"
          />
          <UDropdownMenu
            :items="[
              [
                {
                  label: 'Monter',
                  icon: 'i-lucide-arrow-up',
                  disabled: index === 0,
                  onSelect: () => move(index, -1),
                },
                {
                  label: 'Descendre',
                  icon: 'i-lucide-arrow-down',
                  disabled: index === items.length - 1,
                  onSelect: () => move(index, 1),
                },
              ],
              [
                {
                  label: 'Supprimer',
                  icon: 'i-lucide-trash-2',
                  color: 'error',
                  onSelect: () => remove(index),
                },
              ],
            ]"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              size="sm"
              class="sm:hidden"
              :aria-label="`Actions pour « ${cvItemLabel(section, item)} »`"
            />
          </UDropdownMenu>
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="sm"
            class="hidden sm:inline-flex"
            :aria-label="`Supprimer « ${cvItemLabel(section, item)} »`"
            @click="remove(index)"
          />
        </div>

        <div
          v-if="expansion.isOpen(item.id)"
          :id="`item-${item.id}`"
          class="space-y-4 border-t border-default p-4"
        >
          <div class="grid grid-cols-2 gap-3">
            <UFormField
              v-for="entry in fields"
              :key="entry.field"
              :label="entry.label"
              :hint="
                entry.textarea && record(item)[entry.field]!.length >= entry.max * 0.7
                  ? `${record(item)[entry.field]!.length}/${entry.max}`
                  : undefined
              "
              :class="HALF_WIDTH.has(entry.field) ? 'col-span-1' : 'col-span-2'"
            >
              <UTextarea
                v-if="entry.textarea"
                v-model="record(item)[entry.field]"
                class="w-full"
                :rows="2"
                autoresize
                :maxlength="entry.max"
              />
              <UInput
                v-else
                v-model="record(item)[entry.field]"
                class="w-full"
                :maxlength="entry.max"
                :placeholder="PLACEHOLDERS[entry.field]"
              />
            </UFormField>
            <UFormField
              v-if="section === 'languages'"
              label="Niveau CECRL"
              class="col-span-2"
              help="Sert aux jauges des modèles qui en dessinent. Si le champ « Niveau » est rempli, c’est lui qui est écrit."
            >
              <USelect
                :model-value="languageOf(item).cefr ?? 'none'"
                :items="cefrOptions"
                class="w-full"
                aria-label="Niveau CECRL"
                @update:model-value="setCefr(item, $event as string)"
              />
            </UFormField>
          </div>

          <CvBulletsEditor
            v-if="hasBullets"
            :model-value="bulletsOf(item)"
            :item-label="cvItemLabel(section, item)"
          >
            <template #actions="{ bullet }">
              <slot name="bullet-actions" :item="item" :bullet="bullet" />
            </template>
          </CvBulletsEditor>

          <CvEditorsSkills
            v-if="section === 'skills'"
            :model-value="skillsOf(item).items"
            :group-label="cvItemLabel(section, item)"
            :levels-drawn="skillLevelsDrawn ?? false"
          />
        </div>
      </li>
    </VueDraggable>

    <UButton
      v-if="items.length < max"
      :label="ADD_LABELS[section]"
      icon="i-lucide-plus"
      color="neutral"
      variant="outline"
      size="sm"
      @click="add"
    />
  </div>
</template>
