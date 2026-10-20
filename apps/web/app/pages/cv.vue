<script setup lang="ts">
import type { Generation, Paginated, Resume, ResumeReviewOutput } from '@piston/shared'

useSeoMeta({ title: 'CV' })

const toast = useToast()

const { data: resumes, refresh: refreshResumes } = await useFetch<Resume[]>('/api/resumes', {
  default: () => [],
})
const currentResume = computed(() => resumes.value.find((resume) => resume.isCurrent))

// --- Review -----------------------------------------------------------------

const { start, partial, generation, pending, error } = useGeneration('resume_review')
const reviewedResumeId = ref<string | null>(null)

// The last saved review is shown until a new one starts. The route may not
// exist yet on older deployments: a failed fetch simply means "no review".
const { data: latest } = await useFetch<Paginated<Generation<'resume_review'>>>(
  '/api/generations?kind=resume_review&pageSize=1',
)
const saved = computed(() => latest.value?.items[0])

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

// --- Versions ---------------------------------------------------------------

async function setCurrent(resume: Resume) {
  try {
    await $fetch(`/api/resumes/${resume.id}/current`, { method: 'PATCH' })
    await refreshResumes()
    toast.add({ title: `« ${resume.title} » est maintenant ton CV actuel.` })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  }
}

const formOpen = ref(false)

async function onCreated() {
  formOpen.value = false
  await refreshResumes()
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="CV" />
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-8">
        <section aria-labelledby="cv-versions" class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 id="cv-versions" class="text-lg font-semibold">Mes versions</h2>
            <UButton
              :label="formOpen ? 'Fermer' : 'Ajouter une version'"
              :icon="formOpen ? 'i-lucide-x' : 'i-lucide-plus'"
              color="neutral"
              variant="outline"
              :aria-expanded="formOpen"
              aria-controls="cv-form"
              @click="formOpen = !formOpen"
            />
          </div>

          <UCard v-if="formOpen || !resumes.length" id="cv-form">
            <p v-if="!resumes.length" class="mb-3 text-sm text-muted">
              Ajoute ton CV pour commencer : toutes les fonctionnalités de Piston s'appuient dessus.
            </p>
            <ResumeForm @created="onCreated" />
          </UCard>

          <ResumeVersionList
            v-if="resumes.length"
            :resumes="resumes"
            :reviewing-id="pending ? reviewedResumeId : null"
            @review="review"
            @set-current="setCurrent"
          />
        </section>

        <section aria-labelledby="cv-review" class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 id="cv-review" class="text-lg font-semibold">Critique</h2>
            <UButton
              v-if="currentResume"
              label="Critiquer mon CV actuel"
              icon="i-lucide-sparkles"
              :loading="pending"
              @click="review(currentResume)"
            />
          </div>
          <p class="text-sm text-muted">
            Claude note ton CV, cite ses points forts et ses faiblesses, puis propose une réécriture
            ligne par ligne. Les chiffres à compléter apparaissent entre crochets.
          </p>

          <UAlert
            v-if="error"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="error"
          />

          <template v-if="shown">
            <p v-if="shownResume" class="text-sm text-muted">
              Critique de « {{ shownResume.title }} »
              <template v-if="!pending && !generation && saved">
                du {{ new Date(saved.createdAt).toLocaleDateString('fr-FR') }}
              </template>
            </p>
            <ResumeReviewResult :output="shown" />
          </template>
          <p v-else-if="pending" class="text-sm text-muted">Claude lit ton CV…</p>
          <p v-else class="text-sm text-muted">Aucune critique pour l'instant.</p>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
