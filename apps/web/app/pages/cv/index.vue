<script setup lang="ts">
import type {
  Generation,
  Paginated,
  Resume,
  ResumeProfile,
  ResumeReviewOutput,
} from '@piston/shared'

useSeoMeta({ title: 'CV' })

const toast = useToast()
const route = useRoute()
const router = useRouter()

// --- Profiles (one CV per specialty) -----------------------------------------

const { profiles, refresh: refreshProfiles } = await useResumeProfiles()

/** The profile shown, from `?profil=` so links work; else the default one. */
const selectedProfile = computed<ResumeProfile | undefined>(() => {
  const wanted = typeof route.query.profil === 'string' ? route.query.profil : undefined
  return (
    profiles.value.find((profile) => profile.id === wanted) ??
    profiles.value.find((profile) => profile.isDefault) ??
    profiles.value[0]
  )
})
const selectedId = computed(() => selectedProfile.value?.id)

function selectProfile(id: string | undefined) {
  if (!id || id === route.query.profil) return
  router.replace({ query: { ...route.query, profil: id } })
}

async function onProfileCreated(profile: ResumeProfile) {
  await refreshProfiles()
  // A new profile has no version: the page shows the form to add its first one.
  selectProfile(profile.id)
}

async function onProfileDeleted() {
  const { profil: _removed, ...query } = route.query
  await router.replace({ query })
  await refreshAll()
}

// --- Versions of the selected profile ----------------------------------------

const { data: resumes, refresh: refreshResumes } = await useFetch<Resume[]>('/api/resumes', {
  query: computed(() => (selectedId.value ? { profileId: selectedId.value } : {})),
  default: () => [],
})
const currentResume = computed(() => resumes.value.find((resume) => resume.isCurrent))

async function refreshAll() {
  await Promise.all([refreshResumes(), refreshProfiles()])
}

async function setCurrent(resume: Resume) {
  try {
    await $fetch(`/api/resumes/${resume.id}/current`, { method: 'PATCH' })
    await refreshAll()
    toast.add({
      title: 'Version actuelle changée',
      description: `« ${resume.title} » est maintenant la version actuelle de « ${selectedProfile.value?.name} ».`,
      icon: 'i-lucide-check',
    })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

/** « Nouvelle version » dialog (paste or PDF), from the summary card or the Versions tab. */
const formOpen = ref(false)
const documentList = useTemplateRef<{ openCreate: () => void }>('documentList')

// --- Tabs ----------------------------------------------------------------------

const tabs = ['critique', 'mises-en-page', 'versions'] as const
type Tab = (typeof tabs)[number]

// In the URL (?vue=versions) so links and reloads land on the same tab. The old
// #cv-builder anchor still opens the layouts.
const tab = computed<Tab>({
  get: () => {
    if (route.hash === '#cv-builder') return 'mises-en-page'
    const value = route.query.vue
    return tabs.includes(value as Tab) ? (value as Tab) : 'critique'
  },
  set: (value) => router.replace({ query: { ...route.query, vue: value }, hash: '' }),
})

const tabItems = computed(() => [
  { label: 'Critique', icon: 'i-lucide-sparkles', value: 'critique' },
  { label: 'Mises en page', icon: 'i-lucide-file-pen-line', value: 'mises-en-page' },
  {
    label: 'Versions',
    icon: 'i-lucide-history',
    value: 'versions',
    badge: resumes.value.length > 1 ? String(resumes.value.length) : undefined,
  },
])

async function onCreated(resume: Resume) {
  formOpen.value = false
  await refreshAll()
  toast.add({
    title: 'Version ajoutée',
    description: `« ${resume.title} » est maintenant la version actuelle.`,
    icon: 'i-lucide-check',
  })
  // The first resume of a user creates « Principal »: show it.
  selectProfile(resume.profileId)
}

// --- Review of the selected profile -------------------------------------------

const { start, abort, reset, partial, generation, pending, error } = useGeneration('resume_review')
const reviewedResumeId = ref<string | null>(null)

// The last saved review of this profile is shown until a new one starts.
const { data: latest } = await useFetch<Paginated<Generation<'resume_review'>>>(
  '/api/generations',
  {
    query: computed(() => ({
      kind: 'resume_review',
      pageSize: 1,
      ...(selectedId.value && { profileId: selectedId.value }),
    })),
  },
)
const saved = computed(() => (selectedId.value ? latest.value?.items[0] : undefined))

// Switching profile forgets the review being shown and closes the form.
watch(selectedId, () => {
  reset()
  reviewedResumeId.value = null
  formOpen.value = false
})

// While streaming, show what has been parsed so far; afterwards the saved result.
const shown = computed<Partial<ResumeReviewOutput> | undefined>(() =>
  pending.value || generation.value
    ? (partial.value ?? generation.value?.output)
    : saved.value?.output,
)

/** Which resume version the displayed review is about, to say it above the result. */
const shownResume = computed(() => {
  const id =
    pending.value || generation.value ? reviewedResumeId.value : saved.value?.inputRefs.resumeId
  return resumes.value.find((resume) => resume.id === id)
})

async function review(resume: Resume) {
  reviewedResumeId.value = resume.id
  tab.value = 'critique'
  await start({ resumeId: resume.id })
}

/** Average of the four scores of the last review, for the ring of the summary card. */
const savedAverage = computed(() => {
  const scores = saved.value?.output.scores
  if (!scores) return null
  const values = Object.values(scores).filter((v): v is number => typeof v === 'number')
  return values.length
    ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
    : null
})
/** Whether the last review is about an older version than the current one. */
const reviewIsStale = computed(
  () => !!saved.value && saved.value.inputRefs.resumeId !== currentResume.value?.id,
)
</script>

<template>
  <AppPage tip="cv" title="CV" description="Ton CV, sa critique par Claude et ses mises en page.">
    <template #actions>
      <ResumeProfileManager
        :profiles="profiles"
        :selected="selectedProfile"
        @select="selectProfile"
        @changed="refreshProfiles()"
        @created="onProfileCreated"
        @deleted="onProfileDeleted"
      />
    </template>

    <!-- No version yet: one thing to do, nothing else on the page. -->
    <UCard v-if="!currentResume" id="cv-form" :ui="{ body: 'p-5 sm:p-8' }">
      <div class="mb-6 flex items-start gap-3">
        <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10">
          <UIcon name="i-lucide-file-user" class="size-5 text-primary" />
        </span>
        <div v-if="selectedProfile">
          <p class="font-semibold text-highlighted">
            Ajoute la première version de « {{ selectedProfile.name }} »
          </p>
          <p class="text-sm text-muted">
            Colle le texte de ce CV ou importe son PDF. Les autres profils ne changent pas.
          </p>
        </div>
        <div v-else>
          <p class="font-semibold text-highlighted">Commence par ton CV</p>
          <p class="text-sm text-muted">
            Toutes les fonctionnalités de Piston s'appuient dessus. Colle son texte ou importe un
            PDF.
          </p>
        </div>
      </div>
      <ResumeForm :key="selectedId" :profile-id="selectedId" @created="onCreated" />
    </UCard>

    <div v-else class="space-y-6">
      <!-- The CV in use, its last grade and the main action: where the eye lands first. -->
      <UCard :ui="{ body: 'p-5 sm:p-6' }">
        <div class="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div class="flex min-w-0 flex-1 items-center gap-4">
            <ScoreRing
              v-if="savedAverage !== null"
              :value="savedAverage"
              :max="10"
              label="Note moyenne de la dernière critique"
            />
            <span
              v-else
              class="grid size-20 shrink-0 place-items-center rounded-full bg-elevated"
              aria-hidden="true"
            >
              <UIcon name="i-lucide-file-user" class="size-7 text-muted" />
            </span>
            <div class="min-w-0 space-y-0.5">
              <p class="text-xs font-semibold tracking-wider text-primary uppercase">
                Version actuelle
              </p>
              <p class="truncate text-lg font-semibold text-highlighted">
                {{ currentResume.title }}
              </p>
              <p class="truncate text-sm text-muted">
                {{ formatDate(currentResume.createdAt, 'long') }}
                <template v-if="currentResume.sourceFilename">
                  · {{ currentResume.sourceFilename }}
                </template>
              </p>
              <p class="text-sm text-muted">
                <template v-if="!saved">Pas encore critiqué</template>
                <template v-else-if="reviewIsStale">
                  Dernière critique sur une version précédente
                </template>
                <template v-else>Critiqué le {{ formatDate(saved.createdAt, 'long') }}</template>
              </p>
            </div>
          </div>
          <div class="grid shrink-0 grid-cols-2 gap-2 sm:flex">
            <!-- Shorter labels on phones, where the two buttons share one row. -->
            <UButton
              icon="i-lucide-upload"
              color="neutral"
              variant="outline"
              class="justify-center"
              @click="formOpen = true"
            >
              <span class="sm:hidden">Remplacer</span>
              <span class="hidden sm:inline">Nouvelle version</span>
            </UButton>
            <UButton
              icon="i-lucide-sparkles"
              class="justify-center"
              :aria-label="`Critiquer « ${currentResume.title} »`"
              :loading="pending && reviewedResumeId === currentResume.id"
              :disabled="pending"
              @click="review(currentResume)"
            >
              <span class="sm:hidden">Critiquer</span>
              <span class="hidden sm:inline">
                {{ saved && !reviewIsStale ? 'Nouvelle critique' : 'Critiquer' }}
              </span>
            </UButton>
          </div>
        </div>
      </UCard>

      <UTabs
        v-model="tab"
        :items="tabItems"
        :content="false"
        variant="link"
        class="w-full"
        :ui="{
          list: 'overflow-x-auto overflow-y-hidden [scrollbar-width:none]',
          trigger: 'shrink-0',
        }"
      />

      <!-- Critique -->
      <div v-if="tab === 'critique'" class="space-y-4" aria-live="polite">
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="error"
        />
        <div v-if="pending || (shown && shownResume)" class="flex flex-wrap items-center gap-3">
          <StreamingIndicator v-if="pending" text="Claude critique ton CV…" @stop="abort" />
          <p v-if="shown && shownResume" class="text-sm text-muted">
            Critique de « {{ shownResume.title }} »
            <template v-if="!pending && !generation && saved">
              du {{ formatDate(saved.createdAt, 'long') }}
            </template>
          </p>
        </div>
        <ResumeReviewResult v-if="shown" :output="shown" />
        <ResultSkeleton v-else-if="pending" />
        <UEmpty
          v-else
          icon="i-lucide-file-search"
          title="Pas encore de critique"
          description="Quatre notes sur 10, un score ATS, ce qui coince et une réécriture prête à copier. Environ une minute."
          :actions="[
            {
              label: 'Critiquer la version actuelle',
              icon: 'i-lucide-sparkles',
              onClick: () => review(currentResume!),
            },
          ]"
        />
      </div>

      <!-- Mises en page -->
      <div v-else-if="tab === 'mises-en-page'" class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="max-w-prose text-sm text-muted">
            Ton CV dans un modèle soigné, que Claude t’aide à améliorer. Enregistre-le comme version
            pour que critiques, analyses et lettres l’utilisent.
          </p>
          <UButton
            label="Nouveau CV"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            @click="documentList?.openCreate()"
          />
        </div>
        <CvDocumentList
          ref="documentList"
          :key="selectedId"
          :profile-id="selectedId"
          :current-resume="currentResume"
        />
      </div>

      <!-- Versions -->
      <div v-else class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="max-w-prose text-sm text-muted">
            L’historique de
            {{ selectedProfile ? `« ${selectedProfile.name} »` : 'ton CV' }}. La version actuelle
            sert aux analyses d’offres et aux lettres.
          </p>
          <UButton
            label="Ajouter une version"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            @click="formOpen = true"
          />
        </div>
        <ResumeVersionList
          :resumes="resumes"
          :reviewing-id="pending ? reviewedResumeId : null"
          @review="review"
          @set-current="setCurrent"
          @changed="refreshAll()"
        />
      </div>
    </div>

    <UModal
      v-model:open="formOpen"
      title="Nouvelle version"
      :description="
        selectedProfile
          ? `Elle devient la version actuelle de « ${selectedProfile.name} ». Les précédentes restent dans l’onglet Versions.`
          : undefined
      "
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <ResumeForm :key="selectedId" :profile-id="selectedId" @created="onCreated" />
      </template>
    </UModal>
  </AppPage>
</template>
