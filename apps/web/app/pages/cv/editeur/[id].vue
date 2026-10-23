<script setup lang="ts">
import type { CvContentBox } from '@piston/cv-render'
import {
  applyCvOperationsToDocument,
  checkCv,
  cvItemLabel,
  cvSectionTitle,
  cvTemplates,
  type CvCheck,
  type CvContent,
  type CvDocument,
  type CvEditBody,
  type CvListSectionKey,
  type CvOperation,
  type CvSectionKey,
  type Resume,
} from '@piston/shared'

/**
 * The CV builder: form editor, live PDF preview, live checks, design options
 * and Claude's proposals. On phones the parts are tabs (« Aperçu » included);
 * from `lg` the preview stays on the right.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()
const id = String(route.params.id)

const { data: initial } = await useFetch<CvDocument>(`/api/cv-documents/${id}`)
if (!initial.value) {
  throw createError({ statusCode: 404, statusMessage: 'CV introuvable', fatal: true })
}
const document = initial.value

const editor = useCvEditor(document)
const { state, updatedAt, status, errorMessage } = editor

// The header photo: uploads go straight to the server, the preview gets it as a data URL.
const photo = useCvPhoto(id, () => state.content)

useSeoMeta({ title: () => state.title })

// --- Layout --------------------------------------------------------------------

type Tab = 'content' | 'ai' | 'design' | 'preview'
const tab = ref<Tab>('content')
/** On desktop the preview is always visible, so « Aperçu » falls back to « Contenu ». */
const sideTab = computed<Exclude<Tab, 'preview'>>(() =>
  tab.value === 'preview' ? 'content' : tab.value,
)

// Phones get text-only tabs: four labels with icons do not fit in 375 px.
const mobileTabs = [
  { label: 'Contenu', value: 'content' },
  { label: 'Design', value: 'design' },
  { label: 'IA', value: 'ai' },
  { label: 'Aperçu', value: 'preview' },
]
const desktopTabs = [
  { label: 'Contenu', value: 'content', icon: 'i-lucide-list' },
  { label: 'Design', value: 'design', icon: 'i-lucide-palette' },
  { label: 'IA', value: 'ai', icon: 'i-lucide-sparkles' },
]

/** Classes of a side panel: shown for its tab on phones, for `sideTab` from `lg`. */
function panelClass(name: Exclude<Tab, 'preview'>) {
  return [
    tab.value === name ? 'block' : 'hidden',
    sideTab.value === name ? 'lg:block' : 'lg:hidden',
  ]
}

// --- Preview and checks --------------------------------------------------------------

// The preview is rendered in the browser (a Web Worker running the same
// renderer as the server's PDF export), on every change, before autosave.
const {
  result: preview,
  status: previewStatus,
  error: previewError,
} = useCvPreview(
  () => ({
    content: state.content,
    design: state.design,
    templateId: state.templateId,
  }),
  () => photo.assets.value,
)
const pageCount = computed(() => preview.value?.pageCount)

/** « 2 pages », and how little of the last one is used when it almost fits. */
const pageSummary = computed(() => {
  const result = preview.value
  if (!result) return null
  const pages = result.pageCount === 1 ? '1 page' : `${result.pageCount} pages`
  const fill = Math.round(result.lastPageFill * 100)
  const almost =
    result.pageCount > 1 && result.lastPageFill < 0.25
      ? `La dernière page n’est remplie qu’à ${fill} % : en resserrant un peu (espacement, taille du texte, une puce en moins), ton CV tiendrait sur ${result.pageCount - 1 === 1 ? 'une page' : `${result.pageCount - 1} pages`}.`
      : null
  return { pages, almost }
})
const checks = computed(() =>
  checkCv(state.content, state.design, state.templateId, { pageCount: pageCount.value }),
)
const checksToFix = computed(() => checks.value.filter((check) => check.level !== 'info').length)

async function goToCheck(check: CvCheck) {
  tab.value = 'content'
  await nextTick()
  const target = check.target
  if (!target) return
  // Open the section (and item) holding the problem, then focus its first field.
  const contentId = target.itemId
    ? `item.${target.itemId}`
    : target.section === 'header'
      ? 'header.fullName'
      : `section.${target.section}`
  await contentEditor.value?.reveal(contentId)
}

// --- Click-to-edit ---------------------------------------------------------------------

const contentEditor = useTemplateRef<{ reveal: (contentId: string) => Promise<boolean> }>(
  'contentEditor',
)

/** The content id of the field being hovered or focused in the editor. */
const hoveredId = ref<string | null>(null)
const highlight = computed<CvContentBox[]>(() =>
  hoveredId.value ? (preview.value?.boxes.filter((box) => box.id === hoveredId.value) ?? []) : [],
)

/** A click or tap on the preview: edit the smallest content box under the point. */
async function onPreviewPoint(point: { page: number; x: number; y: number }) {
  const boxes = (preview.value?.boxes ?? []).filter(
    (box) =>
      box.page === point.page &&
      point.x >= box.x &&
      point.x <= box.x + box.width &&
      point.y >= box.y &&
      point.y <= box.y + box.height,
  )
  const smallest = boxes.sort((a, b) => a.width * a.height - b.width * b.height)[0]
  if (!smallest) return
  // On phones the preview is its own tab: go back to the editor, then focus the field.
  tab.value = 'content'
  await nextTick()
  await contentEditor.value?.reveal(smallest.id)
}

// A new template is a visible change worth a restore point.
watch(
  () => state.templateId,
  (templateId) =>
    void editor.save({ label: `Modèle « ${cvTemplates[templateId].label} »`, source: 'manual' }),
)

// --- Saving and leaving ------------------------------------------------------------

const STATUS = {
  saved: { icon: 'i-lucide-check', label: 'Enregistré', class: 'text-muted' },
  pending: { icon: 'i-lucide-pencil', label: 'Modifications…', class: 'text-muted' },
  saving: { icon: 'i-lucide-loader-circle', label: 'Enregistrement…', class: 'text-muted' },
  error: { icon: 'i-lucide-cloud-off', label: 'Non enregistré', class: 'text-error' },
  conflict: { icon: 'i-lucide-triangle-alert', label: 'Conflit', class: 'text-error' },
} as const

onBeforeRouteLeave(async () => {
  await editor.flush()
})

function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (status.value === 'pending' || status.value === 'saving' || status.value === 'error') {
    event.preventDefault()
  }
}

/**
 * Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y undo and redo the document. In
 * dialogs and outside the editor's own fields (the AI instruction box) the
 * browser's text undo is left alone.
 */
function onUndoShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  const key = event.key.toLowerCase()
  const redo = (key === 'z' && event.shiftKey) || key === 'y'
  if (!redo && !(key === 'z' && !event.shiftKey)) return
  const target = event.target as HTMLElement | null
  if (target?.closest('[role="dialog"]')) return
  const typing = target?.matches('input, textarea, select, [contenteditable="true"]')
  if (typing && !target?.closest('[data-cv-editor]')) return
  event.preventDefault()
  if (redo) editor.redo()
  else editor.undo()
}

onMounted(() => {
  window.addEventListener('beforeunload', warnBeforeUnload)
  window.addEventListener('keydown', onUndoShortcut)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeUnload)
  window.removeEventListener('keydown', onUndoShortcut)
})

// --- Claude's proposals ----------------------------------------------------------------------

const aiPanel = useTemplateRef<{
  run: (body: Omit<CvEditBody, 'documentId'>, label: string) => Promise<void>
}>('aiPanel')

/** The « IA » menus ask for a proposal here: show the AI panel and start it. */
provide(CV_AI_REQUEST, (body, label) => {
  tab.value = 'ai'
  void aiPanel.value?.run(body, label)
})

function sectionLabel(key: CvSectionKey) {
  const section = state.content.sections.find((entry) => entry.key === key)!
  return `la section « ${cvSectionTitle(section, state.design.language)} »`
}

function itemLabel(section: CvListSectionKey, item: Parameters<typeof cvItemLabel>[1]) {
  return `« ${cvItemLabel(section, item)} »`
}

/**
 * Applies the accepted operations, records a revision labelled with the
 * request, and offers to undo it. A translation of the whole CV also
 * switches the document's language, so section titles follow.
 */
async function applyProposal(payload: {
  operations: CvOperation[]
  label: string
  generationId: string
  body: CvEditBody
}) {
  const before = JSON.parse(
    JSON.stringify({
      content: state.content,
      design: state.design,
      templateId: state.templateId,
    }),
  ) as { content: CvContent; design: typeof state.design; templateId: typeof state.templateId }
  // An accepted proposal is one undo step, whatever was typed just before.
  editor.breakUndoStep()
  const { state: next, results } = applyCvOperationsToDocument(
    {
      content: JSON.parse(JSON.stringify(state.content)),
      design: JSON.parse(JSON.stringify(state.design)),
      templateId: state.templateId,
    },
    payload.operations,
  )
  const applied = results.filter((result) => result.ok).length
  if (!applied) {
    toast.add({ title: 'Aucune modification n’a pu être appliquée.', color: 'warning' })
    return
  }
  state.content = next.content
  state.design = next.design
  state.templateId = next.templateId
  const body = payload.body
  if (body.mode === 'action' && body.action === 'translate_en' && !body.scope.section) {
    state.design.language = 'en'
  }
  await editor.save({ label: payload.label, source: 'ai', generationId: payload.generationId })

  const failed = results.length - applied
  toast.add({
    title: applied === 1 ? '1 modification appliquée' : `${applied} modifications appliquées`,
    description: failed
      ? `${failed} ne s’appliquaient plus à ton CV et ont été ignorées.`
      : undefined,
    icon: 'i-lucide-sparkles',
    actions: [
      {
        label: 'Annuler',
        onClick: () => {
          editor.breakUndoStep()
          state.content = before.content
          state.design = before.design
          state.templateId = before.templateId
          void editor.save({ label: `Annulation : ${payload.label}`, source: 'manual' })
        },
      },
    ],
  })
}

/** « Dans une copie dédiée »: duplicate for the offer, then tailor the copy. */
async function tailorInCopy(offerId: string) {
  try {
    await editor.flush()
    const copy = await $fetch<CvDocument>(`/api/cv-documents/${id}/duplicate`, {
      method: 'POST',
      body: { offerId },
    })
    await router.push({ path: `/cv/editeur/${copy.id}`, query: { adapter: offerId } })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  }
}

// Opened with ?adapter=<offerId> (a copy made for an offer): start the
// tailoring once, and drop the flag so a reload does not pay for it again.
onMounted(async () => {
  const offerToTailor = typeof route.query.adapter === 'string' ? route.query.adapter : null
  if (!offerToTailor) return
  await router.replace({ query: {} })
  tab.value = 'ai'
  await nextTick()
  void aiPanel.value?.run({ mode: 'tailor', offerId: offerToTailor }, 'IA : adapté à l’offre')
})

// --- Actions ------------------------------------------------------------------------------

const busy = ref<'version' | 'duplicate' | 'delete' | null>(null)
const historyOpen = ref(false)
const renameOpen = ref(false)
const deleteOpen = ref(false)
const newTitle = ref('')

async function download(path: string) {
  await editor.flush()
  window.location.href = path
}

async function saveAsVersion() {
  busy.value = 'version'
  try {
    await editor.flush()
    const resume = await $fetch<Resume>(`/api/cv-documents/${id}/save-version`, { method: 'POST' })
    toast.add({
      title: `« ${resume.title} » est la nouvelle version actuelle de ton profil.`,
      description: 'Critiques, analyses et lettres l’utilisent désormais.',
      icon: 'i-lucide-check',
      actions: [{ label: 'Voir sur la page CV', to: `/cv?profil=${resume.profileId}` }],
    })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    busy.value = null
  }
}

async function duplicate() {
  busy.value = 'duplicate'
  try {
    await editor.flush()
    const copy = await $fetch<CvDocument>(`/api/cv-documents/${id}/duplicate`, {
      method: 'POST',
      body: {},
    })
    await router.push(`/cv/editeur/${copy.id}`)
    toast.add({ title: 'Copie créée', icon: 'i-lucide-copy' })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    busy.value = null
  }
}

async function remove() {
  busy.value = 'delete'
  try {
    await $fetch(`/api/cv-documents/${id}`, { method: 'DELETE' })
    deleteOpen.value = false
    // Nothing left to save.
    status.value = 'saved'
    await router.push(`/cv?profil=${document.profileId}`)
    toast.add({ title: 'CV supprimé', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    busy.value = null
  }
}

function openRename() {
  newTitle.value = state.title
  renameOpen.value = true
}

function rename() {
  if (!newTitle.value.trim()) return
  state.title = newTitle.value.trim()
  renameOpen.value = false
}

const moreItems = computed(() => [
  [
    { label: 'Renommer', icon: 'i-lucide-pencil', onSelect: openRename },
    { label: 'Historique', icon: 'i-lucide-history', onSelect: () => (historyOpen.value = true) },
    { label: 'Dupliquer', icon: 'i-lucide-copy', onSelect: duplicate },
  ],
  [
    {
      label: 'Exporter en texte (.txt)',
      icon: 'i-lucide-file-text',
      onSelect: () => download(`/api/cv-documents/${id}/export?format=txt`),
    },
    {
      label: 'Exporter en Markdown (.md)',
      icon: 'i-lucide-file-code',
      onSelect: () => download(`/api/cv-documents/${id}/export?format=md`),
    },
    {
      label: 'Exporter en JSON',
      icon: 'i-lucide-braces',
      onSelect: () => download(`/api/cv-documents/${id}/export?format=json`),
    },
  ],
  [
    {
      label: 'Supprimer',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => (deleteOpen.value = true),
    },
  ],
])
</script>

<template>
  <AppPage
    :title="state.title"
    width="wide"
    :back="{ to: `/cv?profil=${document.profileId}`, label: 'CV' }"
  >
    <template #description> Modèle « {{ cvTemplates[state.templateId].label }} » </template>
    <template #actions>
      <UButton
        label="Enregistrer comme version"
        icon="i-lucide-file-check"
        :loading="busy === 'version'"
        @click="saveAsVersion"
      />
      <UDropdownMenu :items="moreItems" :content="{ align: 'end' }">
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="outline"
          aria-label="Plus d’actions"
        />
      </UDropdownMenu>
    </template>

    <UAlert
      v-if="status === 'conflict' || status === 'error'"
      class="mb-6"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="errorMessage ?? 'Enregistrement impossible.'"
      :actions="
        status === 'conflict'
          ? [
              {
                label: 'Recharger',
                color: 'error',
                variant: 'solid',
                onClick: () => reloadNuxtApp(),
              },
            ]
          : [{ label: 'Réessayer', color: 'error', variant: 'solid', onClick: () => editor.save() }]
      "
    />

    <!-- Sticky bar: save status, undo / redo, page count, download; the phone tabs sit under it. -->
    <div
      class="sticky top-0 z-30 -mx-4 mb-5 border-b border-default bg-canvas/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10"
    >
      <div class="flex items-center gap-2 py-2">
        <span
          class="inline-flex min-w-0 items-center gap-1.5 text-sm"
          :class="STATUS[status].class"
          role="status"
          aria-live="polite"
        >
          <UIcon
            :name="STATUS[status].icon"
            class="size-4 shrink-0"
            :class="{ 'animate-spin': status === 'saving' }"
          />
          <span class="truncate">{{ STATUS[status].label }}</span>
        </span>
        <div class="ml-auto flex items-center gap-1">
          <UTooltip text="Annuler (Ctrl+Z)">
            <UButton
              icon="i-lucide-undo-2"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="!editor.canUndo.value"
              aria-label="Annuler la dernière modification"
              @click="editor.undo()"
            />
          </UTooltip>
          <UTooltip text="Rétablir (Ctrl+Maj+Z)">
            <UButton
              icon="i-lucide-redo-2"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="!editor.canRedo.value"
              aria-label="Rétablir la modification annulée"
              @click="editor.redo()"
            />
          </UTooltip>
          <UBadge
            v-if="pageSummary"
            :label="pageSummary.pages"
            icon="i-lucide-file"
            color="neutral"
            variant="subtle"
            class="ml-1"
          />
          <div class="ml-1">
            <CvExportMenu :document-id="id" :before-export="editor.flush" />
          </div>
        </div>
      </div>
      <UTabs
        v-model="tab"
        :items="mobileTabs"
        :content="false"
        class="pb-2 lg:hidden"
        aria-label="Parties de l’éditeur"
      />
    </div>

    <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-start">
      <div class="min-w-0">
        <UTabs
          :model-value="sideTab"
          :items="desktopTabs"
          :content="false"
          class="mb-5 hidden lg:flex"
          aria-label="Parties de l’éditeur"
          @update:model-value="tab = $event as Tab"
        />

        <div :class="panelClass('content')">
          <CvContentEditor
            ref="contentEditor"
            v-model="state.content"
            :language="state.design.language"
            :template-id="state.templateId"
            :design="state.design"
            :photo="photo"
            @highlight="hoveredId = $event"
          >
            <template #section-actions="{ section }">
              <CvAiMenu :scope="{ section }" :label="sectionLabel(section)" />
            </template>
            <template #item-actions="{ section, item }">
              <CvAiMenu :scope="{ section, itemId: item.id }" :label="itemLabel(section, item)" />
            </template>
            <template #bullet-actions="{ section, item, bullet }">
              <CvAiMenu
                :scope="{ section, itemId: item.id, bulletId: bullet.id }"
                :label="`une puce de ${itemLabel(section, item)}`"
              />
            </template>
          </CvContentEditor>
        </div>

        <div :class="panelClass('ai')">
          <CvAiPanel
            ref="aiPanel"
            :document-id="id"
            :content="state.content"
            :offer-id="document.offerId"
            :design="state.design"
            :template-id="state.templateId"
            :page-count="pageCount"
            :before-copy="() => editor.flush()"
            @apply="applyProposal"
            @tailor-in-copy="tailorInCopy"
          />
        </div>

        <div :class="panelClass('design')">
          <CvDesignPanel
            v-if="sideTab === 'design' || tab === 'design'"
            v-model:template-id="state.templateId"
            v-model:design="state.design"
            :document-id="id"
            :content="state.content"
            :version="updatedAt"
          />
        </div>
      </div>

      <aside
        class="min-w-0 space-y-6 lg:sticky lg:top-16 lg:block lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto"
        :class="tab === 'preview' ? 'block' : 'hidden'"
        aria-label="Aperçu et vérifications"
      >
        <div>
          <ClientOnly>
            <CvPdfPreview
              class="[&_canvas]:cursor-pointer"
              :data="preview?.pdf ?? null"
              :busy="previewStatus === 'rendering'"
              :highlight="highlight"
              label="Aperçu du CV. Touche une zone pour la modifier."
              @point="onPreviewPoint"
            />
            <template #fallback>
              <div class="aspect-[210/297] animate-pulse rounded-sm bg-elevated" />
            </template>
          </ClientOnly>
          <UAlert
            v-if="previewError"
            class="mt-2"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="previewError"
          />
          <p v-if="pageSummary" class="mt-3 text-sm text-muted" role="status">
            <span class="font-medium text-highlighted">{{ pageSummary.pages }}</span>
            <template v-if="pageSummary.almost"> · {{ pageSummary.almost }}</template>
          </p>
        </div>
        <UCard>
          <template #header>
            <h2 class="flex items-center gap-2 font-semibold text-highlighted">
              <UIcon name="i-lucide-list-checks" class="size-5 text-primary" />
              Vérifications
              <UBadge
                v-if="checksToFix"
                :label="String(checksToFix)"
                color="warning"
                variant="subtle"
                size="sm"
              />
            </h2>
          </template>
          <CvChecksList :checks="checks" @go="goToCheck" />
        </UCard>
      </aside>
    </div>

    <CvRevisionsSlideover
      v-model:open="historyOpen"
      :document-id="id"
      @restored="editor.replace($event)"
    />

    <UModal v-model:open="renameOpen" title="Renommer le CV">
      <template #body>
        <form class="space-y-4" @submit.prevent="rename">
          <UFormField
            label="Nom du CV"
            required
            help="Pour toi seulement : il n’apparaît pas sur le PDF."
          >
            <UInput v-model="newTitle" class="w-full" :maxlength="120" autofocus />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton label="Annuler" color="neutral" variant="ghost" @click="renameOpen = false" />
            <UButton type="submit" label="Renommer" :disabled="!newTitle.trim()" />
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      v-model:open="deleteOpen"
      :title="`Supprimer « ${state.title} » ?`"
      description="Le CV et son historique seront supprimés. Les versions déjà enregistrées sur la page CV sont gardées."
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="ghost" @click="deleteOpen = false" />
          <UButton
            label="Supprimer"
            color="error"
            icon="i-lucide-trash-2"
            :loading="busy === 'delete'"
            @click="remove"
          />
        </div>
      </template>
    </UModal>
  </AppPage>
</template>
