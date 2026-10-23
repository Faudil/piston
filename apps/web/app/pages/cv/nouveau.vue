<script setup lang="ts">
import {
  CvDesign,
  CvInterviewAnswers,
  cvInterviewQuestions,
  cvTemplates,
  type CvTemplateId,
  type CvDocument,
  type CvDraftOutput,
  type Resume,
} from '@piston/shared'

/**
 * « Créer mon CV » with Claude: structure an existing resume version
 * (import), or answer six questions (interview). Claude streams a draft,
 * then the document is created and the editor opens.
 */
useSeoMeta({ title: 'Créer mon CV' })

const route = useRoute()
const router = useRouter()
const toast = useToast()

type Mode = 'import' | 'interview'
const mode = ref<Mode>(route.query.mode === 'interview' ? 'interview' : 'import')
const modeTabs = [
  { label: 'Depuis mon CV', value: 'import', icon: 'i-lucide-file-input' },
  { label: 'Entretien guidé', value: 'interview', icon: 'i-lucide-messages-square' },
]

const { profiles, defaultProfile } = await useResumeProfiles()
const profileId = ref<string | null>(
  (typeof route.query.profil === 'string' && profiles.value.some((p) => p.id === route.query.profil)
    ? route.query.profil
    : defaultProfile.value?.id) ?? null,
)

// --- Template ----------------------------------------------------------------------

// Chosen before the draft: the document is created with it (and its recommended
// section order). It can be changed later in the editor's design tab.
const templateId = ref<CvTemplateId>('sobre')
const templateOpen = ref(false)
const defaultDesign = CvDesign.parse({})

// --- Import -----------------------------------------------------------------------

const { data: resumes } = await useFetch<Resume[]>('/api/resumes', {
  query: computed(() => (profileId.value ? { profileId: profileId.value } : {})),
  default: () => [],
})
const resumeId = ref<string | undefined>(
  typeof route.query.version === 'string' ? route.query.version : undefined,
)
watch(
  resumes,
  (list) => {
    if (!list.some((resume) => resume.id === resumeId.value)) {
      resumeId.value = (list.find((resume) => resume.isCurrent) ?? list[0])?.id
    }
  },
  { immediate: true },
)
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })
const resumeItems = computed(() =>
  resumes.value.map((resume) => ({
    value: resume.id,
    label: `${resume.title}${resume.isCurrent ? ' (actuelle)' : ''} · ${dateFormat.format(new Date(resume.createdAt))}`,
  })),
)

// --- Interview ----------------------------------------------------------------------

const answers = reactive({
  targetJob: '',
  contact: '',
  experiences: '',
  education: '',
  skills: '',
  extras: '',
})
const interviewError = computed(() => {
  const result = CvInterviewAnswers.safeParse(answers)
  return result.success ? null : (result.error.issues[0]?.message ?? 'Réponses incomplètes.')
})
const LIMITS: Record<keyof typeof answers, number> = {
  targetJob: 200,
  contact: 500,
  experiences: 4000,
  education: 2000,
  skills: 2000,
  extras: 2000,
}

// --- Generation ------------------------------------------------------------------------

const { start, partial, pending, error } = useGeneration('cv_draft')
const creating = ref(false)
const draftPreview = computed(() => partial.value as Partial<CvDraftOutput> | undefined)

async function run() {
  const body =
    mode.value === 'import'
      ? { mode: 'import', resumeId: resumeId.value }
      : { mode: 'interview', answers, ...(profileId.value && { profileId: profileId.value }) }
  const generation = await start(body)
  if (!generation) return

  creating.value = true
  try {
    const document = await $fetch<CvDocument>('/api/cv-documents', {
      method: 'POST',
      body: {
        fromGenerationId: generation.id,
        templateId: templateId.value,
        ...(profileId.value && { profileId: profileId.value }),
      },
    })
    await router.push(`/cv/editeur/${document.id}`)
    toast.add({
      title: 'Ton CV est prêt à être relu',
      description: 'Vérifie chaque rubrique : les crochets comme « [X %] » sont à remplir.',
      icon: 'i-lucide-sparkles',
    })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    creating.value = false
  }
}

const canRun = computed(() =>
  mode.value === 'import' ? Boolean(resumeId.value) : interviewError.value === null,
)
</script>

<template>
  <AppPage
    title="Créer mon CV"
    description="Claude structure ce que tu lui donnes, sans rien inventer. Tu relis et complètes ensuite dans l’éditeur."
    width="narrow"
    :back="{ to: profileId ? `/cv?profil=${profileId}` : '/cv', label: 'CV' }"
  >
    <div class="space-y-6">
      <UTabs
        v-model="mode"
        :items="modeTabs"
        :content="false"
        class="w-full"
        aria-label="Point de départ"
      />

      <ResumeProfileSelect
        v-if="profiles.length > 1"
        v-model="profileId"
        :profiles="profiles"
        label="Profil de CV"
        description="Le nouveau CV sera rangé dans ce profil."
      />

      <UCard>
        <div class="flex items-center gap-4">
          <div class="w-20 shrink-0 sm:w-24">
            <ClientOnly>
              <CvGalleryThumbnail
                :template-id="templateId"
                :design="defaultDesign"
                :label="`Aperçu du modèle ${cvTemplates[templateId].label}`"
                :lazy="false"
              />
            </ClientOnly>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm text-muted">Modèle</p>
            <p class="font-display text-lg font-semibold text-highlighted">
              {{ cvTemplates[templateId].label }}
            </p>
            <p class="text-sm text-muted">{{ cvTemplates[templateId].description }}</p>
            <UButton
              label="Choisir un autre modèle"
              icon="i-lucide-layout-grid"
              color="neutral"
              variant="outline"
              size="sm"
              class="mt-2"
              @click="templateOpen = true"
            />
          </div>
        </div>
      </UCard>
      <ClientOnly>
        <CvGalleryPicker
          v-model:open="templateOpen"
          v-model:template-id="templateId"
          :design="defaultDesign"
        />
      </ClientOnly>

      <UCard v-if="mode === 'import'">
        <div class="space-y-4">
          <p class="text-sm text-muted">
            Claude range le texte de ta version dans les rubriques (expériences, formation,
            compétences…), sans le réécrire. Tu l’amélioreras ensuite, modification par
            modification.
          </p>
          <UFormField v-if="resumes.length" label="Version à reprendre" required>
            <USelect v-model="resumeId" :items="resumeItems" class="w-full" />
          </UFormField>
          <UAlert
            v-else
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            title="Ce profil n’a pas encore de version."
            description="Ajoute ton CV sur la page CV, ou crée-le avec l’entretien."
          />
        </div>
      </UCard>

      <UCard v-else>
        <form class="space-y-5" @submit.prevent="run">
          <UFormField
            v-for="question in cvInterviewQuestions"
            :key="question.key"
            :label="question.label"
            :help="question.help"
            :required="question.required"
            :hint="`${answers[question.key].length}/${LIMITS[question.key]}`"
          >
            <UInput
              v-if="question.rows === 1"
              v-model="answers[question.key]"
              class="w-full"
              :maxlength="LIMITS[question.key]"
            />
            <UTextarea
              v-else
              v-model="answers[question.key]"
              class="w-full"
              :rows="question.rows"
              autoresize
              :maxlength="LIMITS[question.key]"
            />
          </UFormField>
        </form>
      </UCard>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="error"
      />

      <div class="flex flex-wrap items-center gap-3">
        <UButton
          :label="mode === 'import' ? 'Structurer avec Claude' : 'Écrire mon brouillon'"
          icon="i-lucide-sparkles"
          size="lg"
          :loading="pending || creating"
          :disabled="!canRun"
          @click="run"
        />
        <p v-if="mode === 'interview' && interviewError && !pending" class="text-sm text-muted">
          {{ interviewError }}
        </p>
        <StreamingIndicator v-if="pending" text="Claude structure ton CV…" />
        <p v-else-if="creating" class="text-sm text-muted" role="status">Création du CV…</p>
      </div>

      <UCard v-if="pending && draftPreview?.header" aria-live="polite">
        <p class="font-display text-xl font-semibold text-highlighted">
          {{ draftPreview.header.fullName || '…' }}
        </p>
        <p v-if="draftPreview.header.title" class="text-primary">{{ draftPreview.header.title }}</p>
        <ul v-if="draftPreview.experiences?.length" class="mt-4 space-y-1 text-sm">
          <li
            v-for="(experience, index) in draftPreview.experiences"
            :key="index"
            class="flex gap-2"
          >
            <UIcon name="i-lucide-briefcase" class="mt-0.5 size-4 shrink-0 text-muted" />
            <span>{{
              [experience?.title, experience?.organization].filter(Boolean).join(' — ')
            }}</span>
          </li>
        </ul>
      </UCard>
    </div>
  </AppPage>
</template>
