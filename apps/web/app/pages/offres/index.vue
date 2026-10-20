<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { CreateOfferBody, LIMITS, type JobOffer } from '@piston/shared'

useSeoMeta({ title: 'Offres' })

const route = useRoute()
const toast = useToast()

const { data: offers, error } = await useFetch<JobOffer[]>('/api/offers')

// The dashboard links to /offres?new=1 to open the form directly.
const formOpen = ref(route.query.new === '1')
watch(
  () => route.query.new,
  (value) => {
    if (value === '1') formOpen.value = true
  },
)
// With no offer yet, the form is the only useful thing on the page.
const showForm = computed(() => formOpen.value || offers.value?.length === 0)

const state = reactive({ title: '', company: '', url: '', rawText: '' })
const submitting = ref(false)
const tooLong = computed(() => state.rawText.length > LIMITS.maxTextLength)
const numberFormat = new Intl.NumberFormat('fr-FR')

async function onSubmit(event: FormSubmitEvent<CreateOfferBody>) {
  submitting.value = true
  try {
    const offer = await $fetch<JobOffer>('/api/offers', { method: 'POST', body: event.data })
    // The offer page starts the analysis right away: one less tap on a phone.
    await navigateTo(`/offres/${offer.id}?analyze=1`)
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, "Impossible d'enregistrer l'offre."), color: 'error' })
  } finally {
    submitting.value = false
  }
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Offres">
        <template #right>
          <UButton
            v-if="!showForm"
            label="Nouvelle offre"
            icon="i-lucide-plus"
            @click="formOpen = true"
          />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-6">
        <UCard v-if="showForm">
          <template #header>
            <h2 class="font-semibold">Nouvelle offre</h2>
            <p class="text-sm text-muted">
              Colle le texte de l'annonce : Claude le compare ensuite à ton CV.
            </p>
          </template>
          <UForm :schema="CreateOfferBody" :state="state" class="space-y-4" @submit="onSubmit">
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Intitulé du poste" name="title" required>
                <UInput v-model="state.title" class="w-full" placeholder="Développeur front" />
              </UFormField>
              <UFormField label="Entreprise" name="company">
                <UInput v-model="state.company" class="w-full" />
              </UFormField>
            </div>
            <UFormField label="Lien de l'annonce" name="url" hint="Facultatif">
              <UInput
                v-model="state.url"
                type="url"
                inputmode="url"
                class="w-full"
                placeholder="https://"
              />
            </UFormField>
            <UFormField label="Texte de l'offre" name="rawText" required>
              <UTextarea
                v-model="state.rawText"
                :rows="10"
                autoresize
                :maxrows="20"
                class="w-full"
              />
              <template #help>
                <span :class="tooLong ? 'text-error' : ''" aria-live="polite">
                  {{ numberFormat.format(state.rawText.length) }} /
                  {{ numberFormat.format(LIMITS.maxTextLength) }} caractères
                </span>
              </template>
            </UFormField>
            <div class="flex flex-wrap gap-2">
              <UButton
                type="submit"
                label="Enregistrer et analyser"
                icon="i-lucide-sparkles"
                :loading="submitting"
                :disabled="tooLong"
              />
              <UButton
                v-if="offers?.length"
                label="Annuler"
                color="neutral"
                variant="ghost"
                @click="formOpen = false"
              />
            </div>
          </UForm>
        </UCard>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          title="Impossible de charger tes offres."
        />

        <section v-else-if="offers?.length" aria-labelledby="offers-list" class="space-y-3">
          <h2 id="offers-list" class="font-semibold">Tes offres</h2>
          <ul class="divide-y divide-default rounded-lg border border-default">
            <li v-for="offer in offers" :key="offer.id">
              <NuxtLink
                :to="`/offres/${offer.id}`"
                class="flex items-center justify-between gap-3 p-3 hover:bg-elevated focus-visible:bg-elevated"
              >
                <div class="min-w-0">
                  <p class="truncate font-medium">{{ offer.title }}</p>
                  <p class="truncate text-sm text-muted">
                    <template v-if="offer.company">{{ offer.company }} · </template>
                    {{ dateFormat.format(new Date(offer.createdAt)) }}
                  </p>
                </div>
                <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
              </NuxtLink>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
