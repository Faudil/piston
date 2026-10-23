<script setup lang="ts">
import {
  applyCvOperations,
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
  { label: 'IA', value: 'ai' },
  { label: 'Design', value: 'design' },
  { label: 'Aperçu', value: 'preview' },
]
const desktopTabs = [
  { label: 'Contenu', value: 'content', icon: 'i-lucide-list' },
  { label: 'IA', value: 'ai', icon: 'i-lucide-sparkles' },
  { label: 'Design', value: 'design', icon: 'i-lucide-palette' },
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
} = useCvPreview(() => ({
  content: state.content,
  design: state.design,
  templateId: state.templateId,
}))
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
  const selector = target.itemId
    ? `[data-item-id="${target.itemId}"]`
    : target.section === 'header'
      ? '#section-title-header'
      : `#section-${target.section}`
  const element = window.document.querySelector<HTMLElement>(selector)
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  element?.querySelector<HTMLElement>('button, input, textarea')?.focus({ preventScroll: true })
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
onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))

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
  const before: CvContent = JSON.parse(JSON.stringify(state.content))
  const languageBefore = state.design.language
  const { content, results } = applyCvOperations(state.content, payload.operations)
  const applied = results.filter((result) => result.ok).length
  if (!applied) {
    toast.add({ title: 'Aucune modification n’a pu être appliquée.', color: 'warning' })
    return
  }
  state.content = content
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
          state.content = before
          state.design.language = languageBefore
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
    <template #description>
      <span class="inline-flex items-center gap-1.5" :class="STATUS[status].class" role="status">
        <UIcon
          :name="STATUS[status].icon"
          class="size-4"
          :class="{ 'animate-spin': status === 'saving' }"
        />
        {{ STATUS[status].label }}
      </span>
      <span class="text-muted"> · Modèle « {{ cvTemplates[state.templateId].label }} »</span>
    </template>
    <template #actions>
      <UButton
        label="Télécharger le PDF"
        icon="i-lucide-download"
        color="neutral"
        variant="outline"
        @click="download(`/api/cv-documents/${id}/pdf?download=1`)"
      />
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

    <UTabs
      v-model="tab"
      :items="mobileTabs"
      :content="false"
      class="mb-5 lg:hidden"
      aria-label="Parties de l’éditeur"
    />

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
          <CvContentEditor v-model="state.content" :language="state.design.language">
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
            :version="updatedAt"
          />
        </div>
      </div>

      <aside
        class="min-w-0 space-y-6 lg:sticky lg:top-6 lg:block"
        :class="tab === 'preview' ? 'block' : 'hidden'"
        aria-label="Aperçu et vérifications"
      >
        <div>
          <ClientOnly>
            <CvPdfPreview
              :data="preview?.pdf ?? null"
              :busy="previewStatus === 'rendering'"
              label="Aperçu du CV"
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
