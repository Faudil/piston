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
  selectProfile(profile.id)
  formOpen.value = true
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
</script>

<template>
  <AppPage
    title="CV"
    description="Un profil par spécialité (« Communication », « Marketing digital »…), chacun avec ses propres versions et sa critique par Claude, sans langue de bois."
  >
    <div class="space-y-12">
      <ResumeProfileManager
        :profiles="profiles"
        :selected="selectedProfile"
        @select="selectProfile"
        @changed="refreshProfiles()"
        @created="onProfileCreated"
        @deleted="onProfileDeleted"
      />

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
  </AppPage>
</template>
