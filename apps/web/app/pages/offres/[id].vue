<script setup lang="ts">
import type { Generation, JobOffer, OfferAnalysisOutput } from '@piston/shared'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const offerId = route.params.id as string

const { data: offer, error: offerError } = await useFetch<JobOffer>(`/api/offers/${offerId}`)
const { data: previous } = await useFetch<{
  analysis: Generation<'offer_analysis'> | null
  coverLetter: Generation<'cover_letter'> | null
}>(`/api/offers/${offerId}/generations`)

useSeoMeta({ title: () => offer.value?.title ?? 'Offre' })

// --- Analysis ---------------------------------------------------------------

const analysis = useGeneration('offer_analysis')

// While streaming, show what has been parsed so far; otherwise the last saved analysis.
const shownAnalysis = computed<Partial<OfferAnalysisOutput> | undefined>(() =>
  analysis.pending.value || analysis.generation.value
    ? (analysis.partial.value ?? analysis.generation.value?.output)
    : previous.value?.analysis?.output,
)

function analyze() {
  void analysis.start({ offerId })
}

onMounted(() => {
  // Coming from the creation form (?analyze=1): start right away, then drop
  // the flag so a page reload does not run (and bill) a second analysis.
  if (route.query.analyze === '1') {
    void router.replace({ query: {} })
    if (offer.value && !previous.value?.analysis) analyze()
  }
})

// --- Application ------------------------------------------------------------

const adding = ref(false)
const goToApplications = [{ label: 'Voir', to: '/candidatures', color: 'neutral' as const }]

async function addToApplications() {
  adding.value = true
  try {
    await $fetch('/api/applications', { method: 'POST', body: { jobOfferId: offerId } })
    toast.add({
      title: 'Ajoutée aux candidatures',
      icon: 'i-lucide-kanban',
      actions: goToApplications,
    })
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 409) {
      toast.add({
        title: 'Cette offre est déjà dans tes candidatures.',
        icon: 'i-lucide-info',
        actions: goToApplications,
      })
    } else {
      toast.add({ title: apiErrorMessage(err), color: 'error' })
    }
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="offer?.title ?? 'Offre'">
        <template #leading>
          <UButton
            to="/offres"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            aria-label="Retour aux offres"
          />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div v-if="offerError || !offer" class="mx-auto w-full max-w-3xl space-y-4">
        <UAlert color="error" variant="subtle" title="Offre introuvable." />
        <UButton to="/offres" label="Retour aux offres" color="neutral" variant="outline" />
      </div>

      <div v-else class="mx-auto w-full max-w-3xl space-y-8">
        <header class="space-y-2">
          <h1 class="text-xl font-semibold">{{ offer.title }}</h1>
          <p v-if="offer.company" class="text-muted">{{ offer.company }}</p>
          <ULink
            v-if="offer.url"
            :to="offer.url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-sm text-primary underline"
          >
            Voir l'annonce <UIcon name="i-lucide-external-link" class="size-4" />
          </ULink>
          <UCollapsible>
            <UButton
              label="Texte de l'offre"
              color="neutral"
              variant="ghost"
              size="sm"
              trailing-icon="i-lucide-chevron-down"
              class="-ml-2.5"
            />
            <template #content>
              <p class="mt-2 whitespace-pre-line rounded-lg bg-elevated p-3 text-sm">
                {{ offer.rawText }}
              </p>
            </template>
          </UCollapsible>
        </header>

        <section aria-labelledby="analysis-title" class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 id="analysis-title" class="text-lg font-semibold">Analyse</h2>
            <UButton
              :label="shownAnalysis ? 'Relancer' : 'Analyser l\'offre'"
              :icon="shownAnalysis ? 'i-lucide-refresh-cw' : 'i-lucide-sparkles'"
              :variant="shownAnalysis ? 'outline' : 'solid'"
              :loading="analysis.pending.value"
              @click="analyze"
            />
          </div>
          <UAlert
            v-if="analysis.error.value"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="analysis.error.value"
          >
            <template v-if="analysis.error.value.includes('CV')" #description>
              <ULink to="/cv" class="underline">Aller à la page CV</ULink>
            </template>
          </UAlert>
          <div aria-live="polite">
            <OfferAnalysisResult v-if="shownAnalysis" :output="shownAnalysis" />
            <p v-else-if="analysis.pending.value" class="text-sm text-muted">
              Claude lit l'offre et ton CV…
            </p>
            <p v-else class="text-sm text-muted">
              Claude compare l'offre à ton CV : score, compétences, questions d'entretien.
            </p>
          </div>
        </section>

        <USeparator />

        <section aria-labelledby="letter-title" class="space-y-4">
          <h2 id="letter-title" class="text-lg font-semibold">Lettre de motivation</h2>
          <CoverLetterEditor :offer-id="offerId" :initial="previous?.coverLetter ?? null" />
        </section>

        <USeparator />

        <UButton
          label="Ajouter aux candidatures"
          icon="i-lucide-kanban"
          size="lg"
          block
          :loading="adding"
          @click="addToApplications"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
