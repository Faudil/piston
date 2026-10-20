<script setup lang="ts">
import type { JobOffer } from '@piston/shared'

useSeoMeta({ title: 'Offres' })

const route = useRoute()
const router = useRouter()

const { data: offers, error } = await useFetch<JobOffer[]>('/api/offers')

// The dashboard links to /offres?new=1 to open the form directly, and the job
// search to /offres?new=1&url=... to import an ad.
const formOpen = ref(route.query.new === '1')
const importUrl = ref(typeof route.query.url === 'string' ? route.query.url : undefined)
watch(
  () => route.query,
  (query) => {
    if (query.new === '1') formOpen.value = true
    if (typeof query.url === 'string') importUrl.value = query.url
  },
)
onMounted(() => {
  // Drop the URL from the address bar so a reload does not import (and bill) twice.
  if (route.query.url) void router.replace({ query: { new: '1' } })
})
// With no offer yet, the form is the only useful thing on the page.
const showForm = computed(() => formOpen.value || offers.value?.length === 0)

function closeForm() {
  formOpen.value = false
  importUrl.value = undefined
  void router.replace({ query: {} })
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })
</script>

<template>
  <AppPage
    title="Offres"
    description="Les annonces qui t'intéressent. Claude analyse chacune et t'aide à écrire ta lettre."
  >
    <template v-if="!showForm" #actions>
      <UButton label="Nouvelle offre" icon="i-lucide-plus" @click="formOpen = true" />
    </template>

    <div class="space-y-10">
      <!-- Keyed on the URL so an import link opened while the form is visible runs again. -->
      <OfferForm
        v-if="showForm"
        :key="importUrl"
        :import-url="importUrl"
        :cancellable="Boolean(offers?.length)"
        @cancel="closeForm"
      />

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Impossible de charger tes offres."
      />

      <section v-else-if="offers?.length" aria-labelledby="offers-list">
        <AppSectionHeading
          id="offers-list"
          title="Tes offres"
          :description="`${offers.length} offre${offers.length > 1 ? 's' : ''} enregistrée${offers.length > 1 ? 's' : ''}`"
        />
        <ul class="grid gap-3 sm:grid-cols-2">
          <li v-for="offer in offers" :key="offer.id">
            <NuxtLink
              :to="`/offres/${offer.id}`"
              class="group flex h-full items-center gap-4 rounded-2xl border border-default bg-default p-4 shadow-xs transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span
                class="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 font-display text-lg font-semibold text-primary"
                aria-hidden="true"
              >
                {{ (offer.company || offer.title).charAt(0).toUpperCase() }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-highlighted">{{ offer.title }}</span>
                <span class="block truncate text-sm text-muted">
                  <template v-if="offer.company">{{ offer.company }} · </template>
                  {{ dateFormat.format(new Date(offer.createdAt)) }}
                </span>
              </span>
              <UIcon
                name="i-lucide-chevron-right"
                class="size-5 shrink-0 text-dimmed transition group-hover:translate-x-0.5 group-hover:text-primary"
              />
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>
  </AppPage>
</template>
