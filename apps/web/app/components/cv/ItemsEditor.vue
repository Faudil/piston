<script setup lang="ts">
import {
  CV_LIMITS,
  createCvItem,
  cvFieldLabels,
  cvFieldMaxLength,
  cvItemLabel,
  cvItemTextFields,
  cvSectionMaxItems,
  formatCvDateRange,
  newCvId,
  type CvBullet,
  type CvItem,
  type CvListSectionKey,
  type CvSkill,
} from '@piston/shared'

/**
 * The items of a list section (experiences, education, skills...): one
 * collapsible card per item with its fields, its bullets or its skills, and
 * buttons to move or delete it. Slots let the parent add AI menus.
 */
const items = defineModel<CvItem[]>({ required: true })
const props = defineProps<{ section: CvListSectionKey }>()

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
  level: 'Ex. : C1, courant',
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

// Only one or two items: show them open; otherwise open on demand.
const open = ref(new Set<string>(items.value.length <= 2 ? items.value.map((item) => item.id) : []))

function toggle(id: string) {
  const next = new Set(open.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  open.value = next
}

function add() {
  const item = createCvItem(props.section) as CvItem
  items.value.push(item)
  open.value = new Set([...open.value, item.id])
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

/** The skill names, for the tags input. */
const skillNames = (item: CvItem) => skillsOf(item).items.map((skill) => skill.name)

/** New list of names from the tags input: kept skills keep their id and level. */
function setSkillNames(item: CvItem, names: string[]) {
  const previous = new Map(skillsOf(item).items.map((skill) => [skill.name, skill]))
  skillsOf(item).items = names.map(
    (name) => previous.get(name) ?? { id: newCvId(), name, level: 0 },
  )
}

function dates(item: CvItem) {
  const value = record(item)
  return formatCvDateRange(value.start ?? value.date ?? '', value.end ?? '', 'fr')
}
</script>

<template>
  <div class="space-y-3">
    <ul class="space-y-2">
      <li
        v-for="(item, index) in items"
        :key="item.id"
        class="rounded-xl border border-default bg-default"
        :data-item-id="item.id"
      >
        <div class="flex items-center gap-1 p-2">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
            :aria-expanded="open.has(item.id)"
            :aria-controls="`item-${item.id}`"
            @click="toggle(item.id)"
          >
            <UIcon
              :name="open.has(item.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
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
            :disabled="index === 0"
            :aria-label="`Monter « ${cvItemLabel(section, item)} »`"
            @click="move(index, -1)"
          />
          <UButton
            icon="i-lucide-arrow-down"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="index === items.length - 1"
            :aria-label="`Descendre « ${cvItemLabel(section, item)} »`"
            @click="move(index, 1)"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="`Supprimer « ${cvItemLabel(section, item)} »`"
            @click="remove(index)"
          />
        </div>

        <div
          v-if="open.has(item.id)"
          :id="`item-${item.id}`"
          class="space-y-4 border-t border-default p-4"
        >
          <div class="grid grid-cols-2 gap-3">
            <UFormField
              v-for="entry in fields"
              :key="entry.field"
              :label="entry.label"
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

          <UFormField
            v-if="section === 'skills'"
            label="Compétences"
            :hint="`${skillsOf(item).items.length}/${CV_LIMITS.skillItems}`"
            help="Tape une compétence puis Entrée (ou colle une liste séparée par des virgules)."
          >
            <UInputTags
              :model-value="skillNames(item)"
              class="w-full"
              :max-length="CV_LIMITS.skillItem"
              :max="CV_LIMITS.skillItems"
              add-on-blur
              add-on-paste
              delimiter=","
              placeholder="Ex. : Canva"
              @update:model-value="setSkillNames(item, $event)"
            />
          </UFormField>
        </div>
      </li>
    </ul>

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
