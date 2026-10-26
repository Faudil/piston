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

const profileTabs = computed(() =>
  profiles.value.map((profile) => ({
    label: profile.name,
    value: profile.id,
    badge: profile.isDefault ? { label: 'Par défaut', variant: 'subtle' as const } : undefined,
  })),
)
const profileItems = computed(() =>
  profiles.value.map((profile) => ({
    label: profile.isDefault ? `${profile.name} (par défaut)` : profile.name,
    value: profile.id,
  })),
)
/** Tabs read well for a few short names; beyond that (and on phones) a select is used. */
const useTabs = computed(() => profiles.value.length >= 2 && profiles.value.length <= 4)

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

const formOpen = ref(false)
const documentList = useTemplateRef<{ openCreate: () => void }>('documentList')

async function onCreated(resume: Resume) {
  formOpen.value = false
  await refreshAll()
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
  await start({ resumeId: resume.id })
}

// --- Create / rename / delete a profile ---------------------------------------

const nameModal = reactive({ open: false, mode: 'create' as 'create' | 'rename', name: '' })
const deleteOpen = ref(false)
const busy = ref(false)

function openCreate() {
  Object.assign(nameModal, { open: true, mode: 'create', name: '' })
}

function openRename() {
  Object.assign(nameModal, { open: true, mode: 'rename', name: selectedProfile.value?.name ?? '' })
}

async function submitName() {
  busy.value = true
  try {
    if (nameModal.mode === 'create') {
      const created = await $fetch<ResumeProfile>('/api/profiles', {
        method: 'POST',
        body: { name: nameModal.name },
      })
      await refreshProfiles()
      selectProfile(created.id)
      formOpen.value = true
      toast.add({ title: `Profil « ${created.name} » créé`, icon: 'i-lucide-check' })
    } else {
      await $fetch(`/api/profiles/${selectedId.value}`, {
        method: 'PATCH',
        body: { name: nameModal.name },
      })
      await refreshProfiles()
      toast.add({ title: 'Profil renommé', icon: 'i-lucide-check' })
    }
    nameModal.open = false
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busy.value = false
  }
}

async function makeDefault() {
  const profile = selectedProfile.value
  if (!profile) return
  try {
    await $fetch(`/api/profiles/${profile.id}`, { method: 'PATCH', body: { isDefault: true } })
    await refreshProfiles()
    toast.add({
      title: 'Profil par défaut changé',
      description: `« ${profile.name} » sert désormais aux offres pour lesquelles tu n’en choisis pas d’autre.`,
      icon: 'i-lucide-check',
    })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

async function deleteSelected() {
  const profile = selectedProfile.value
  if (!profile) return
  busy.value = true
  try {
    await $fetch(`/api/profiles/${profile.id}`, { method: 'DELETE' })
    deleteOpen.value = false
    const { profil: _removed, ...query } = route.query
    await router.replace({ query })
    await refreshAll()
    toast.add({ title: `Profil « ${profile.name} » supprimé`, icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busy.value = false
  }
}

// Items that open a dialog wait for the menu to close (see utils/menus.ts).
const profileMenu = computed(() => [
  [
    { label: 'Renommer', icon: 'i-lucide-pencil', onSelect: () => afterMenuCloses(openRename) },
    ...(selectedProfile.value?.isDefault
      ? []
      : [{ label: 'Définir par défaut', icon: 'i-lucide-star', onSelect: makeDefault }]),
  ],
  [
    {
      label: 'Supprimer le profil',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => afterMenuCloses(() => (deleteOpen.value = true)),
    },
  ],
])

const deleteDescription = computed(() => {
  const profile = selectedProfile.value
  if (!profile) return ''
  const versions =
    profile.versionsCount === 0
      ? "Il n'a aucune version."
      : profile.versionsCount === 1
        ? 'Sa version sera supprimée aussi.'
        : `Ses ${profile.versionsCount} versions seront supprimées aussi.`
  const fallback =
    profile.isDefault && profiles.value.length > 1
      ? ' Ton plus ancien autre profil deviendra le profil par défaut.'
      : ''
  return `${versions} Les offres qui l'utilisent passeront au profil par défaut.${fallback} Action définitive.`
})
</script>

<template>
  <AppPage
    title="CV"
    description="Un profil par spécialité (« Communication », « Marketing digital »…), chacun avec ses propres versions et sa critique par Claude, sans langue de bois."
  >
    <div class="space-y-12">
      <section aria-labelledby="cv-profiles" class="space-y-4">
        <AppSectionHeading
          id="cv-profiles"
          title="Profils de CV"
          icon="i-lucide-layers"
          :description="
            profiles.length
              ? 'Le profil par défaut sert aux offres pour lesquelles tu n\'en choisis pas d\'autre.'
              : 'Ton premier CV crée le profil « Principal ». Ajoute-en d\'autres si tu postules dans plusieurs domaines.'
          "
        >
          <UButton
            v-if="profiles.length"
            label="Nouveau profil"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            @click="openCreate"
          />
        </AppSectionHeading>

        <div v-if="profiles.length" class="flex items-end gap-2">
          <div class="min-w-0 flex-1">
            <UTabs
              v-if="useTabs"
              :model-value="selectedId"
              :items="profileTabs"
              :content="false"
              variant="pill"
              class="hidden w-full sm:flex"
              aria-label="Profil de CV affiché"
              @update:model-value="selectProfile(String($event))"
            />
            <UFormField
              label="Profil affiché"
              :class="useTabs ? 'sm:hidden' : ''"
              :ui="{ label: profiles.length === 1 ? 'sr-only' : undefined }"
            >
              <USelect
                :model-value="selectedId"
                :items="profileItems"
                icon="i-lucide-layers"
                class="w-full"
                @update:model-value="selectProfile($event as string)"
              />
            </UFormField>
          </div>
          <UDropdownMenu :items="profileMenu" :modal="false" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="outline"
              :aria-label="`Actions du profil « ${selectedProfile?.name} »`"
            />
          </UDropdownMenu>
        </div>
      </section>

      <section aria-labelledby="cv-versions">
        <AppSectionHeading
          id="cv-versions"
          :title="selectedProfile ? `Versions de « ${selectedProfile.name} »` : 'Mes versions'"
          icon="i-lucide-files"
          description="Chaque profil a son propre historique. Sa version « actuelle » sert aux analyses qui utilisent ce profil."
        >
          <UButton
            v-if="resumes.length"
            :label="formOpen ? 'Fermer' : 'Ajouter une version'"
            :icon="formOpen ? 'i-lucide-x' : 'i-lucide-plus'"
            color="neutral"
            variant="outline"
            :aria-expanded="formOpen"
            aria-controls="cv-form"
            @click="formOpen = !formOpen"
          />
        </AppSectionHeading>

        <div class="space-y-4">
          <UCard v-if="formOpen || !resumes.length" id="cv-form">
            <div v-if="!resumes.length" class="mb-5 flex items-start gap-3">
              <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10">
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
                  Toutes les fonctionnalités de Piston s'appuient dessus. Colle son texte ou importe
                  un PDF.
                </p>
              </div>
            </div>
            <ResumeForm :key="selectedId" :profile-id="selectedId" @created="onCreated" />
          </UCard>

          <ResumeVersionList
            v-if="resumes.length"
            :resumes="resumes"
            :reviewing-id="pending ? reviewedResumeId : null"
            @review="review"
            @set-current="setCurrent"
            @changed="refreshAll()"
          />
        </div>
      </section>

      <section aria-labelledby="cv-builder">
        <AppSectionHeading
          id="cv-builder"
          title="Créer mon CV"
          icon="i-lucide-file-pen-line"
          description="Un CV mis en page et structuré, que Claude t’aide à améliorer. Enregistre-le comme version pour que les critiques, analyses et lettres l’utilisent."
        >
          <UButton
            label="Nouveau CV"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            @click="documentList?.openCreate()"
          />
        </AppSectionHeading>
        <CvDocumentList
          ref="documentList"
          :key="selectedId"
          :profile-id="selectedId"
          :current-resume="currentResume"
        />
      </section>

      <section aria-labelledby="cv-review">
        <AppSectionHeading
          id="cv-review"
          title="Critique"
          icon="i-lucide-sparkles"
          :description="
            selectedProfile && profiles.length > 1
              ? `Claude note la version actuelle de « ${selectedProfile.name} », cite ses points forts et ses faiblesses, puis propose une réécriture ligne par ligne.`
              : 'Claude note ton CV, cite ses points forts et ses faiblesses, puis propose une réécriture ligne par ligne.'
          "
        >
          <UButton
            v-if="currentResume && shown"
            label="Nouvelle critique"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :loading="pending"
            @click="review(currentResume)"
          />
        </AppSectionHeading>

        <div class="space-y-4">
          <UAlert
            v-if="error"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="error"
          />

          <div class="flex flex-wrap items-center gap-3">
            <StreamingIndicator v-if="pending" text="Claude critique ton CV…" @stop="abort" />
            <p v-if="shown && shownResume" class="text-sm text-muted">
              Critique de « {{ shownResume.title }} »
              <template v-if="!pending && !generation && saved">
                du {{ formatDate(saved.createdAt, 'long') }}
              </template>
            </p>
          </div>

          <div aria-live="polite">
            <ResumeReviewResult v-if="shown" :output="shown" />
            <ResultSkeleton v-else-if="pending" />
            <UEmpty
              v-else
              icon="i-lucide-file-search"
              title="Pas encore de critique"
              :description="
                currentResume
                  ? 'Quatre notes sur 10, cinq points forts, cinq points à corriger et une réécriture prête à copier.'
                  : 'Ajoute d\'abord une version ci-dessus, puis lance une critique.'
              "
              :actions="
                currentResume
                  ? [
                      {
                        label: 'Critiquer la version actuelle',
                        icon: 'i-lucide-sparkles',
                        onClick: () => review(currentResume!),
                      },
                    ]
                  : []
              "
            />
          </div>
        </div>
      </section>
    </div>

    <UModal
      v-model:open="nameModal.open"
      :title="nameModal.mode === 'create' ? 'Nouveau profil de CV' : 'Renommer le profil'"
      :description="
        nameModal.mode === 'create'
          ? 'Un profil par spécialité, par exemple « Communication » ou « Marketing digital ».'
          : undefined
      "
    >
      <template #body>
        <form class="space-y-4" @submit.prevent="submitName">
          <UFormField label="Nom du profil" required>
            <UInput
              v-model="nameModal.name"
              class="w-full"
              :maxlength="60"
              placeholder="Ex. : Marketing digital"
              autofocus
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              label="Annuler"
              color="neutral"
              variant="ghost"
              @click="nameModal.open = false"
            />
            <UButton
              type="submit"
              :label="nameModal.mode === 'create' ? 'Créer' : 'Renommer'"
              :loading="busy"
              :disabled="!nameModal.name.trim()"
            />
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      v-model:open="deleteOpen"
      :title="`Supprimer le profil « ${selectedProfile?.name} » ?`"
      :description="deleteDescription"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="ghost" @click="deleteOpen = false" />
          <UButton
            label="Supprimer"
            color="error"
            icon="i-lucide-trash-2"
            :loading="busy"
            @click="deleteSelected"
          />
        </div>
      </template>
    </UModal>
  </AppPage>
</template>
