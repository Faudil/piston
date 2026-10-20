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
  <AppPage
    title="CV"
    description="Garde tes versions de CV au même endroit et fais-les critiquer par Claude, sans langue de bois."
  >
    <div class="space-y-12">
      <section aria-labelledby="cv-versions">
        <AppSectionHeading
          id="cv-versions"
          title="Mes versions"
          icon="i-lucide-files"
          description="La version « actuelle » sert à toutes les analyses."
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
              <div>
                <p class="font-semibold text-highlighted">Commence par ton CV</p>
                <p class="text-sm text-muted">
                  Toutes les fonctionnalités de Piston s'appuient dessus. Colle son texte ou importe
                  un PDF.
                </p>
              </div>
            </div>
            <ResumeForm @created="onCreated" />
          </UCard>

          <ResumeVersionList
            v-if="resumes.length"
            :resumes="resumes"
            :reviewing-id="pending ? reviewedResumeId : null"
            @review="review"
            @set-current="setCurrent"
            @changed="refreshResumes()"
          />
        </div>
      </section>

      <section aria-labelledby="cv-review">
        <AppSectionHeading
          id="cv-review"
          title="Critique"
          icon="i-lucide-sparkles"
          description="Claude note ton CV, cite ses points forts et ses faiblesses, puis propose une réécriture ligne par ligne."
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
            <StreamingIndicator v-if="pending" />
            <p v-if="shown && shownResume" class="text-sm text-muted">
              Critique de « {{ shownResume.title }} »
              <template v-if="!pending && !generation && saved">
                du {{ new Date(saved.createdAt).toLocaleDateString('fr-FR') }}
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
                  : 'Ajoute d\'abord ton CV ci-dessus, puis lance une critique.'
              "
              :actions="
                currentResume
                  ? [
                      {
                        label: 'Critiquer mon CV actuel',
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
