<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { parseCvContentId } from '@piston/cv-render'
import {
  CV_LIMITS,
  createCvCustomSection,
  cvSectionRef,
  cvSectionTitle,
  cvSectionTitles,
  cvTemplates,
  isTwoColumnLayout,
  resolveCvDesign,
  type CvContent,
  type CvCustomSection,
  type CvDesign,
  type CvItem,
  type CvLanguageCode,
  type CvListSectionKey,
  type CvSectionConfig,
  type CvTemplateId,
} from '@piston/shared'

/**
 * Every editable part of a CV document: the header, then the sections in
 * their order. Sections and their items can be dragged (and moved with
 * buttons), hidden empty sections are added from the « Ajouter une section »
 * menu, custom sections are created and deleted here.
 *
 * On phones (below `lg`) the same sections are shown one per screen, with
 * « Précédent / Suivant » and a list to jump (see cv-steps.ts); the other
 * sections stay in the DOM, hidden by CSS, so nothing remounts.
 *
 * Click-to-edit: `reveal(contentId)` opens the right section and item and
 * focuses the field of a renderer content id; hovering or focusing a field
 * emits `highlight` with the id of its box on the preview.
 */
const content = defineModel<CvContent>({ required: true })
const props = defineProps<{
  language: CvLanguageCode
  templateId: CvTemplateId
  design: CvDesign
  photo: CvPhotoController
}>()
const emit = defineEmits<{
  highlight: [contentId: string | null]
  /** « Voir l'aperçu » on the last step of the phone layout. */
  preview: []
}>()

const resolved = computed(() => resolveCvDesign(cvTemplates[props.templateId], props.design))
const twoColumns = computed(() => isTwoColumnLayout(resolved.value.layout))
const skillLevelsDrawn = computed(
  () => resolved.value.skillStyle === 'bars' || resolved.value.skillStyle === 'dots',
)

const SECTION_ICONS: Record<string, string> = {
  summary: 'i-lucide-align-left',
  projects: 'i-lucide-rocket',
  certifications: 'i-lucide-badge-check',
  interests: 'i-lucide-heart',
  volunteering: 'i-lucide-hand-heart',
  awards: 'i-lucide-trophy',
  publications: 'i-lucide-book-open',
  references: 'i-lucide-users',
  extras: 'i-lucide-info',
  experiences: 'i-lucide-briefcase',
  education: 'i-lucide-graduation-cap',
  skills: 'i-lucide-wrench',
  languages: 'i-lucide-languages',
}

// --- Which sections are listed -----------------------------------------------------

const customOf = (section: CvSectionConfig): CvCustomSection | undefined =>
  section.key === 'custom'
    ? content.value.custom.find((entry) => entry.id === section.customId)
    : undefined

/** Sections hidden during this visit stay listed, so they can be shown again. */
const kept = ref(new Set<string>())
watch(
  () => content.value.sections.map((section) => `${cvSectionRef(section)}:${section.visible}`),
  (now, before) => {
    const wasVisible = new Set(
      before.filter((entry) => entry.endsWith(':true')).map((entry) => entry.slice(0, -5)),
    )
    for (const entry of now) {
      if (entry.endsWith(':false') && wasVisible.has(entry.slice(0, -6))) {
        kept.value = new Set([...kept.value, entry.slice(0, -6)])
      }
    }
  },
)

/** Hidden sections that hold nothing are not listed: the add menu offers them. */
const shown = computed(() =>
  content.value.sections.filter(
    (section) =>
      section.visible ||
      kept.value.has(cvSectionRef(section)) ||
      cvSectionHasContent(content.value, section),
  ),
)
const addable = computed(() =>
  content.value.sections.filter(
    (section) => section.key !== 'custom' && !shown.value.includes(section),
  ),
)

const shownModel = computed<CvSectionConfig[]>({
  get: () => shown.value,
  set: (next) => {
    content.value.sections = reorderSubset(content.value.sections, shown.value, next, cvSectionRef)
  },
})

const titleOf = (section: CvSectionConfig) =>
  cvSectionTitle(section, props.language, content.value.custom)

function itemCount(section: CvSectionConfig): number | undefined {
  if (section.key === 'summary') return undefined
  if (section.key === 'custom') return customOf(section)?.items.length
  return (content.value[section.key] as unknown[]).length
}

// --- Steps (phones) -------------------------------------------------------------------

const steps = computed<CvStep[]>(() => [
  {
    ref: CV_HEADER_STEP,
    label: 'En-tête',
    summary: content.value.header.fullName || 'Nom, titre, contact, photo',
  },
  ...shown.value.map((section) => ({
    ref: cvSectionRef(section),
    label: titleOf(section),
    summary: cvSectionSummary(content.value, section),
  })),
])
const currentStep = ref(CV_HEADER_STEP)
/** The step on screen; the first one when its section has gone. */
const activeStep = computed(() => steps.value[cvStepIndex(steps.value, currentStep.value)]!.ref)
/** Hides a card below `lg` unless it is the step on screen. */
const stepClass = (ref: string) => (ref === activeStep.value ? '' : 'max-lg:hidden')

// A phone shows one card: have it open from the start.
onMounted(() => {
  if (!window.matchMedia('(min-width: 1024px)').matches) expansion.open(activeStep.value)
})

const stepNav = useTemplateRef<ComponentPublicInstance>('stepNav')
function goToStep(ref: string) {
  currentStep.value = ref
  expansion.open(ref)
  // Each step starts at the top of its screen.
  void nextTick(() =>
    (stepNav.value?.$el as HTMLElement | undefined)?.scrollIntoView({ block: 'start' }),
  )
}

// --- Expanded cards -------------------------------------------------------------------

const expansion = createCvExpansion([
  ...(content.value.header.fullName.trim() ? [] : ['header']),
  ...shown.value.slice(0, 3).map((section) => cvSectionRef(section)),
])
provide(CV_EXPANSION, expansion)

// --- Moving and adding ----------------------------------------------------------------

function moveSection(index: number, delta: number) {
  const target = index + delta
  const next = [...shown.value]
  if (target < 0 || target >= next.length) return
  const [section] = next.splice(index, 1)
  next.splice(target, 0, section!)
  shownModel.value = next
  // Keep the keyboard focus on the moved section.
  void nextTick(() => {
    const card = document.getElementById(`section-${cvSectionRef(section!)}`)
    const button =
      card?.querySelector<HTMLElement>(`[data-section-move="${delta < 0 ? 'up' : 'down'}"]`) ??
      card?.querySelector<HTMLElement>('[data-section-menu]')
    button?.focus()
  })
}

function rename(section: CvSectionConfig, title: string) {
  const custom = customOf(section)
  if (custom) custom.title = title
  else section.title = title
}

const root = useTemplateRef<HTMLElement>('root')

async function scrollToSection(ref: string) {
  expansion.open(ref)
  currentStep.value = ref
  await nextTick()
  const card = document.getElementById(`section-${ref}`)
  card?.scrollIntoView({ behavior: smooth(), block: 'start' })
  card?.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true })
}

function addBuiltin(section: CvSectionConfig) {
  section.visible = true
  void scrollToSection(cvSectionRef(section))
}

const addCustomOpen = ref(false)
const customTitle = ref('')

function addCustom() {
  const title = customTitle.value.trim()
  if (!title) return
  const section = createCvCustomSection(title, [{}])
  content.value.custom.push(section)
  content.value.sections.push({
    key: 'custom',
    customId: section.id,
    title: '',
    visible: true,
    column: 'auto',
  })
  customTitle.value = ''
  addCustomOpen.value = false
  expansion.open(`custom:${section.id}`)
  expansion.open(section.items[0]!.id)
  void scrollToSection(`custom:${section.id}`)
}

const deleting = ref<CvCustomSection | null>(null)

function removeCustom() {
  const target = deleting.value
  if (!target) return
  content.value.custom = content.value.custom.filter((entry) => entry.id !== target.id)
  content.value.sections = content.value.sections.filter(
    (section) => !(section.key === 'custom' && section.customId === target.id),
  )
  deleting.value = null
}

const addLabel = (section: CvSectionConfig) =>
  cvSectionTitles[props.language][section.key as keyof (typeof cvSectionTitles)['fr']]

const addItems = computed(() => [
  addable.value.map((section) => ({
    label: addLabel(section),
    icon: SECTION_ICONS[section.key],
    onSelect: () => addBuiltin(section),
  })),
  [
    {
      label: 'Section personnalisée…',
      icon: 'i-lucide-plus',
      disabled: content.value.custom.length >= CV_LIMITS.customSections,
      onSelect: () => (addCustomOpen.value = true),
    },
  ],
])

// --- Click-to-edit ------------------------------------------------------------------

const smooth = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

/**
 * Opens the section and item that hold a content id of the preview, scrolls
 * to its field and focuses it. Returns false when nothing matches.
 */
async function reveal(contentId: string): Promise<boolean> {
  const target = parseCvContentId(contentId)
  const place = target && cvLocateContent(content.value, target)
  if (!place) return false
  const section = content.value.sections.find((entry) => cvSectionRef(entry) === place.section)
  if (section && !section.visible) kept.value = new Set([...kept.value, place.section])
  expansion.open(place.section)
  currentStep.value = place.section
  if (place.itemId) expansion.open(place.itemId)
  // Opened cards render on the next frame.
  await nextTick()
  await nextTick()
  const holder = root.value
  const element =
    holder?.querySelector<HTMLElement>(`[data-cv-id="${contentId}"]`) ??
    document.getElementById(`section-${place.section}`)
  if (!element) return false
  element.scrollIntoView({ behavior: smooth(), block: 'center' })
  const field =
    element.querySelector<HTMLElement>('input:not([type=file]):not([type=range]), textarea') ??
    element.querySelector<HTMLElement>('button')
  ;(element.matches('input, textarea') ? element : field)?.focus({ preventScroll: true })
  // A short ring shows where the click landed.
  const ring = ['ring-2', 'ring-primary', 'ring-offset-2']
  element.classList.add(...ring)
  setTimeout(() => element.classList.remove(...ring), 1400)
  return true
}
defineExpose({ reveal })

let highlighted: string | null = null
function setHighlight(contentId: string | null) {
  if (contentId === highlighted) return
  highlighted = contentId
  emit('highlight', contentId)
}

/**
 * On phones the keyboard covers the lower half of the screen: once it is up,
 * bring the focused field to the middle of what remains.
 */
function keepFieldVisible(event: FocusEvent) {
  const field = event.target as HTMLElement | null
  if (!field?.matches?.('input:not([type=file]):not([type=range]), textarea')) return
  if (window.matchMedia('(min-width: 1024px)').matches) return
  setTimeout(() => {
    if (document.activeElement === field)
      field.scrollIntoView({ block: 'center', behavior: smooth() })
  }, 300)
}

const contentIdAt = (event: Event) =>
  (event.target as HTMLElement | null)?.closest?.('[data-cv-id]')?.getAttribute('data-cv-id') ??
  null

const listOf = (key: CvListSectionKey) => content.value[key] as CvItem[]
</script>

<template>
  <div
    ref="root"
    class="space-y-4"
    data-cv-editor
    @focusin="(setHighlight(contentIdAt($event)), keepFieldVisible($event))"
    @focusout="setHighlight(null)"
    @mouseover="setHighlight(contentIdAt($event))"
    @mouseleave="setHighlight(null)"
  >
    <CvStepNav
      ref="stepNav"
      placement="top"
      class="scroll-mt-32"
      :steps="steps"
      :current="activeStep"
      :addable="
        addable.map((section) => ({ ref: cvSectionRef(section), label: addLabel(section) }))
      "
      @select="goToStep"
      @add="addBuiltin(content.sections.find((section) => cvSectionRef(section) === $event)!)"
      @add-custom="addCustomOpen = true"
    />

    <section
      class="rounded-2xl border border-default bg-default shadow-xs"
      :class="stepClass(CV_HEADER_STEP)"
      aria-labelledby="section-title-header"
    >
      <header class="flex items-center gap-1 px-2 py-2 sm:px-3">
        <h3 id="section-title-header" class="min-w-0 flex-1 font-semibold text-highlighted">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
            :aria-expanded="expansion.isOpen('header')"
            aria-controls="section-body-header"
            @click="expansion.toggle('header')"
          >
            <UIcon
              :name="
                expansion.isOpen('header') ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'
              "
              class="size-4 shrink-0 text-muted"
            />
            <span class="min-w-0">
              <span class="block truncate">En-tête</span>
              <span
                v-if="!expansion.isOpen('header')"
                class="block truncate text-xs font-normal text-muted"
              >
                {{ content.header.fullName || 'Nom, titre, contact, photo' }}
              </span>
            </span>
          </button>
        </h3>
        <slot name="header-actions" />
      </header>
      <div
        v-if="expansion.isOpen('header')"
        id="section-body-header"
        class="border-t border-default p-4"
      >
        <CvHeaderEditor v-model="content.header" :photo="photo" />
      </div>
    </section>

    <VueDraggable v-model="shownModel" v-bind="cvDragOptions('section')" class="space-y-4">
      <CvSectionCard
        v-for="(section, index) in shown"
        :key="cvSectionRef(section)"
        :model-value="section"
        :title="titleOf(section)"
        :title-value="customOf(section)?.title ?? section.title"
        :default-title="
          section.key === 'custom' ? undefined : cvSectionTitles[language][section.key]
        "
        :summary="cvSectionSummary(content, section)"
        :index="index"
        :count="shown.length"
        :item-count="itemCount(section)"
        :deletable="section.key === 'custom'"
        :show-column="twoColumns"
        :class="stepClass(cvSectionRef(section))"
        @move="moveSection(index, $event)"
        @rename="rename(section, $event)"
        @remove="deleting = customOf(section) ?? null"
      >
        <template v-if="section.key !== 'custom'" #actions>
          <slot name="section-actions" :section="section.key" />
        </template>

        <template v-if="section.key === 'custom'">
          <CvEditorsCustomSection v-if="customOf(section)" :model-value="customOf(section)!" />
        </template>
        <UFormField
          v-else-if="section.key === 'summary'"
          label="Accroche"
          :hint="`${content.summary.length}/${CV_LIMITS.summary}`"
          :help="cvSectionEmptyHints.summary"
          data-cv-id="summary"
        >
          <UTextarea
            v-model="content.summary"
            class="w-full"
            :rows="3"
            autoresize
            :maxlength="CV_LIMITS.summary"
          />
        </UFormField>
        <template v-else-if="section.key === 'extras'">
          <CvEditorsLines :model-value="content.extras" />
        </template>
        <template v-else>
          <USwitch
            v-if="section.key === 'references'"
            v-model="content.referencesAvailableOnRequest"
            label="Références disponibles sur demande"
            description="Écrit cette phrase à la place de la liste ci-dessous."
          />
          <CvItemsEditor
            :model-value="listOf(section.key)"
            :section="section.key"
            :skill-levels-drawn="skillLevelsDrawn"
          >
            <template #item-actions="{ item }">
              <slot name="item-actions" :section="section.key" :item="item" />
            </template>
            <template #bullet-actions="{ item, bullet }">
              <slot name="bullet-actions" :section="section.key" :item="item" :bullet="bullet" />
            </template>
          </CvItemsEditor>
        </template>
      </CvSectionCard>
    </VueDraggable>

    <CvStepNav
      placement="bottom"
      :steps="steps"
      :current="activeStep"
      @select="goToStep"
      @finish="emit('preview')"
    />

    <UDropdownMenu :items="addItems" :content="{ align: 'start' }">
      <UButton
        label="Ajouter une section"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        block
        class="border-dashed max-lg:hidden"
      />
    </UDropdownMenu>

    <UModal v-model:open="addCustomOpen" title="Nouvelle section">
      <template #body>
        <form class="space-y-4" @submit.prevent="addCustom">
          <UFormField
            label="Titre de la section"
            required
            help="Par exemple : Expositions, Associations, Bénévolat, Références clients…"
          >
            <UInput
              v-model="customTitle"
              class="w-full"
              :maxlength="CV_LIMITS.sectionTitle"
              autofocus
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              label="Annuler"
              color="neutral"
              variant="ghost"
              @click="addCustomOpen = false"
            />
            <UButton type="submit" label="Créer la section" :disabled="!customTitle.trim()" />
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      :open="deleting !== null"
      :title="`Supprimer la section « ${deleting?.title || 'sans titre'} » ?`"
      :description="
        deleting?.items.length
          ? `Ses ${deleting.items.length} élément(s) seront supprimés. Tu pourras annuler avec Ctrl+Z.`
          : undefined
      "
      @update:open="(open) => !open && (deleting = null)"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="ghost" @click="deleting = null" />
          <UButton label="Supprimer" color="error" icon="i-lucide-trash-2" @click="removeCustom" />
        </div>
      </template>
    </UModal>
  </div>
</template>
