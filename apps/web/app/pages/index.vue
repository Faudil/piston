<script setup lang="ts">
import {
  applicationStatusLabels,
  type Application,
  type CvDocumentSummary,
  type Generation,
  type JobOffer,
  type Paginated,
  type Resume,
} from '@piston/shared'

useSeoMeta({ title: 'Accueil' })

const { user } = useUserSession()
const { webSearch } = useFeatures()

// The CV card shows the default profile: the one used when nothing else is chosen.
const { profiles, defaultProfile } = await useResumeProfiles()

// Failed calls fall back to empty data (`default`) so the dashboard never crashes.
const [
  { data: resumes },
  { data: reviews },
  { data: applications },
  { data: offers },
  { data: cvDocuments },
] = await Promise.all([
  useFetch<Resume[]>('/api/resumes', {
    query: computed(() => ({ profileId: defaultProfile.value?.id })),
    default: () => [],
  }),
  useFetch<Paginated<Generation<'resume_review'>>>('/api/generations', {
    query: computed(() => ({
      kind: 'resume_review',
      pageSize: 1,
      profileId: defaultProfile.value?.id,
    })),
  }),
  useFetch<Application[]>('/api/applications', { default: () => [] }),
  useFetch<JobOffer[]>('/api/offers', { default: () => [] }),
  useFetch<CvDocumentSummary[]>('/api/cv-documents', { default: () => [] }),
])

const firstName = computed(() => user.value?.displayName.trim().split(/\s+/)[0] ?? '')
const currentResume = computed(() => resumes.value.find((r) => r.isCurrent))
const lastReview = computed(() => reviews.value?.items[0])
/** Older reviews have no ATS score: the indicator is hidden for them. */
const atsScore = computed(() => lastReview.value?.output.ats?.score)

const scoreLabels = {
  lisibilite: 'Lisibilité',
  impact: 'Impact',
  motsCles: 'Mots-clés',
  coherence: 'Cohérence',
} as const

/** Average of the four review scores, rounded to one decimal. */
const reviewAverage = computed(() => {
  const scores = lastReview.value?.output.scores
  if (!scores) return null
  const values = Object.values(scores).filter((v): v is number => typeof v === 'number')
  return values.length
    ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
    : null
})

const openApplications = computed(() => applications.value.filter((a) => a.status !== 'closed'))
const stats = computed(() => [
  { label: 'Offres', value: offers.value.length, icon: 'i-lucide-briefcase', to: '/offres' },
  {
    label: 'En cours',
    value: openApplications.value.length,
    icon: 'i-lucide-kanban',
    to: '/candidatures',
  },
  {
    label: 'Entretiens',
    value: applications.value.filter((a) => a.status === 'interview').length,
    icon: 'i-lucide-messages-square',
    to: '/candidatures',
  },
])

/** Days after which a sent application deserves a follow-up. */
const FOLLOW_UP_AFTER_DAYS = 10

const lastChange = (application: Application) =>
  application.statusHistory.at(-1)?.at ?? application.updatedAt

/** Applications waiting to be sent, oldest first: the one to finish first. */
const toSend = computed(() =>
  applications.value
    .filter((a) => a.status === 'to_send')
    .sort((a, b) => lastChange(a).localeCompare(lastChange(b))),
)
const toFollowUp = computed(() => {
  const limit = Date.now() - FOLLOW_UP_AFTER_DAYS * 24 * 3_600_000
  return applications.value.find(
    (a) => a.status === 'sent' && new Date(lastChange(a)).getTime() < limit,
  )
})
const where = (application: Application) =>
  application.offer.company ? `chez ${application.offer.company}` : `« ${application.offer.title} »`

/**
 * The single most useful thing to do now, following the main flow: a resume,
 * its review, an offer, then the applications waiting on the user.
 */
const nextStep = computed(() => {
  if (!currentResume.value)
    return {
      icon: 'i-lucide-file-user',
      title: 'Ajoute ton CV pour commencer',
      text: "Piston s'appuie dessus pour tout le reste : critique, analyse d'offres, lettres.",
      action: { label: 'Ajouter mon CV', to: '/cv', icon: 'i-lucide-plus' },
    }
  if (!lastReview.value)
    return {
      icon: 'i-lucide-file-search',
      title: 'Fais critiquer ton CV',
      text: 'Quatre notes, tes points forts, ce qui coince et une réécriture ligne par ligne.',
      action: { label: 'Critiquer mon CV', to: '/cv', icon: 'i-lucide-sparkles' },
    }
  if (!offers.value.length)
    return {
      icon: 'i-lucide-target',
      title: 'Ajoute ta première offre',
      text: 'Claude la compare à ton CV, puis t’aide à écrire la lettre et à adapter ton CV.',
      action: { label: 'Nouvelle offre', to: '/offres?new=1', icon: 'i-lucide-plus' },
    }
  const first = toSend.value[0]
  if (first) {
    const others = toSend.value.length - 1
    return {
      icon: 'i-lucide-send',
      title: `Envoie ta candidature ${where(first)}`,
      text:
        'Termine la lettre, adapte ton CV à l’offre, puis passe la carte dans « Envoyée ».' +
        (others
          ? ` ${others} autre${others > 1 ? 's' : ''} candidature${others > 1 ? 's' : ''} à envoyer.`
          : ''),
      action: {
        label: 'Ouvrir l’offre',
        to: `/offres/${first.offer.id}`,
        icon: 'i-lucide-arrow-right',
      },
    }
  }
  if (toFollowUp.value)
    return {
      icon: 'i-lucide-bell-ring',
      title: `Relance ta candidature ${where(toFollowUp.value)}`,
      text: `Envoyée il y a plus de ${FOLLOW_UP_AFTER_DAYS} jours, sans nouvelle. Une relance courte et polie suffit.`,
      action: {
        label: 'Voir la candidature',
        to: `/candidatures?candidature=${toFollowUp.value.id}`,
        icon: 'i-lucide-arrow-right',
      },
    }
  if (!cvDocuments.value.length)
    return {
      icon: 'i-lucide-file-pen-line',
      title: 'Mets ton CV en page avec Piston',
      text: 'Des modèles lisibles par les logiciels de recrutement, et une copie adaptée à chaque offre en un clic.',
      action: { label: 'Créer mon CV', to: '/cv#cv-builder', icon: 'i-lucide-plus' },
    }
  return {
    icon: 'i-lucide-target',
    title: 'Une autre offre te tente ?',
    text: 'Ajoute-la : Claude la compare à ton CV et prépare ta lettre de motivation.',
    action: { label: 'Nouvelle offre', to: '/offres?new=1', icon: 'i-lucide-plus' },
  }
})
</script>

<template>
  <AppPage
    :title="firstName ? `Bonjour ${firstName}` : 'Bonjour'"
    description="Un pas après l'autre : voici où tu en es et ce que tu peux faire maintenant."
  >
    <div class="space-y-8">
      <!-- Next step: the one card that stands out. -->
      <section
        aria-labelledby="next-step"
        class="relative overflow-hidden rounded-3xl bg-neutral-900 p-6 text-white shadow-lg sm:p-8 dark:bg-neutral-800"
      >
        <div
          class="pointer-events-none absolute -top-20 -right-16 size-72 rounded-full bg-piston-500/30 blur-3xl"
          aria-hidden="true"
        />
        <div class="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <span class="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10">
            <UIcon :name="nextStep.icon" class="size-6 text-piston-300" />
          </span>
          <div class="min-w-0 flex-1 space-y-1">
            <p class="text-xs font-semibold tracking-wider text-piston-300 uppercase">
              Prochaine étape
            </p>
            <h2 id="next-step" class="font-display text-2xl font-medium text-balance">
              {{ nextStep.title }}
            </h2>
            <p class="text-pretty text-neutral-300">{{ nextStep.text }}</p>
          </div>
          <UButton
            v-bind="nextStep.action"
            size="xl"
            color="primary"
            class="justify-center sm:self-center"
          />
        </div>
      </section>

      <!-- Compact stats. -->
      <ul class="grid grid-cols-3 gap-3">
        <li v-for="stat in stats" :key="stat.label">
          <NuxtLink
            :to="stat.to"
            class="flex h-full flex-col gap-1 rounded-2xl border border-default bg-default p-4 shadow-xs transition hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <UIcon :name="stat.icon" class="size-5 text-primary" />
            <span class="font-display text-3xl font-semibold text-highlighted">{{
              stat.value
            }}</span>
            <span class="text-xs font-medium text-muted sm:text-sm">{{ stat.label }}</span>
          </NuxtLink>
        </li>
      </ul>

      <div class="grid gap-4 lg:grid-cols-2">
        <UCard :ui="{ body: 'flex h-full flex-col gap-4' }">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-semibold text-highlighted">
              Mon CV
              <span v-if="profiles.length > 1 && defaultProfile" class="font-normal text-muted">
                · {{ defaultProfile.name }}
              </span>
            </h2>
            <UButton
              :to="defaultProfile ? `/cv?profil=${defaultProfile.id}` : '/cv'"
              label="Gérer"
              color="neutral"
              variant="link"
              size="sm"
            />
          </div>
          <template v-if="currentResume">
            <div class="flex items-center gap-4">
              <ScoreRing
                v-if="reviewAverage !== null"
                :value="reviewAverage"
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
              <div class="min-w-0">
                <p class="truncate font-medium text-highlighted">{{ currentResume.title }}</p>
                <p class="text-sm text-muted">
                  Ajouté le {{ formatDate(currentResume.createdAt, 'long') }}
                </p>
                <p v-if="lastReview" class="text-sm text-muted">
                  Critiqué le {{ formatDate(lastReview.createdAt, 'long') }}
                </p>
                <p v-if="profiles.length > 1" class="text-sm text-muted">
                  Profil par défaut parmi
                  <ULink to="/cv" class="underline">{{ profiles.length }} profils</ULink>
                </p>
              </div>
            </div>
            <dl
              v-if="lastReview"
              class="grid gap-2 border-t border-default pt-4"
              :class="atsScore !== undefined ? 'grid-cols-5' : 'grid-cols-4'"
            >
              <div v-for="(label, key) in scoreLabels" :key="key" class="text-center">
                <dt class="truncate text-xs text-muted">{{ label }}</dt>
                <dd class="font-display text-lg font-semibold text-highlighted">
                  {{ lastReview.output.scores?.[key] ?? '–' }}
                </dd>
              </div>
              <div v-if="atsScore !== undefined" class="text-center">
                <dt class="truncate text-xs text-muted">
                  <abbr title="Compatibilité avec les logiciels de tri des candidatures">ATS</abbr>
                </dt>
                <dd class="font-display text-lg font-semibold text-highlighted">
                  {{ atsScore }}<span class="text-xs font-normal text-muted">/100</span>
                </dd>
              </div>
            </dl>
          </template>
          <UEmpty
            v-else
            icon="i-lucide-file-user"
            title="Pas encore de CV"
            description="Colle son texte ou importe un PDF."
            variant="naked"
            size="sm"
            :actions="[{ label: 'Ajouter mon CV', to: '/cv', size: 'sm' }]"
          />
        </UCard>

        <UCard v-if="webSearch" :ui="{ body: 'flex h-full flex-col gap-4' }">
          <div class="flex items-center gap-3">
            <span class="grid size-10 place-items-center rounded-xl bg-primary/10">
              <UIcon name="i-lucide-search" class="size-5 text-primary" />
            </span>
            <div>
              <h2 class="font-semibold text-highlighted">Chercher des offres</h2>
              <p class="text-sm text-muted">Les annonces récentes des sites d'emploi.</p>
            </div>
          </div>
          <p class="flex-1 text-sm text-pretty text-toned">
            Lance une recherche par poste et par lieu, puis importe une annonce en un clic pour
            l'analyser.
          </p>
          <UButton
            to="/pistes"
            label="Lancer une recherche"
            trailing-icon="i-lucide-arrow-right"
            color="neutral"
            variant="outline"
            class="self-start"
          />
        </UCard>

        <UCard :ui="{ body: 'flex h-full flex-col gap-3' }" :class="{ 'lg:col-span-2': webSearch }">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-semibold text-highlighted">Candidatures en cours</h2>
            <UButton
              to="/candidatures"
              label="Tout voir"
              color="neutral"
              variant="link"
              size="sm"
            />
          </div>
          <ul v-if="openApplications.length" class="-mx-2 divide-y divide-default">
            <li v-for="application in openApplications.slice(0, 5)" :key="application.id">
              <NuxtLink
                :to="`/offres/${application.offer.id}`"
                class="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span
                  class="size-2 shrink-0 rounded-full"
                  :class="statusStyles[application.status].dot"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1 truncate text-sm">
                  <span class="font-medium text-highlighted">{{ application.offer.title }}</span>
                  <span v-if="application.offer.company" class="text-muted">
                    · {{ application.offer.company }}
                  </span>
                </span>
                <UBadge
                  :label="applicationStatusLabels[application.status]"
                  :color="statusStyles[application.status].color"
                  variant="subtle"
                  size="sm"
                />
              </NuxtLink>
            </li>
          </ul>
          <UEmpty
            v-else
            icon="i-lucide-kanban"
            title="Aucune candidature en cours"
            description="Ajoute une offre à tes candidatures pour la suivre étape par étape."
            variant="naked"
            size="sm"
            :actions="[
              {
                label: 'Voir mes offres',
                to: '/offres',
                size: 'sm',
                color: 'neutral',
                variant: 'outline',
              },
            ]"
          />
        </UCard>
      </div>
    </div>
  </AppPage>
</template>
