<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { CreateOfferBody, LIMITS, type ImportedOffer, type JobOffer } from '@piston/shared'

/**
 * New-offer form. With web search enabled, an offer can be imported from its
 * URL first (fields are prefilled, the user reviews them, then saves).
 * `importUrl` runs that import as soon as the form is shown (link from /pistes).
 */
const props = defineProps<{ importUrl?: string; cancellable?: boolean }>()
const emit = defineEmits<{ cancel: [] }>()

const toast = useToast()
const { webSearch } = useFeatures()

const state = reactive({ title: '', company: '', url: '', rawText: '' })
const submitting = ref(false)
const tooLong = computed(() => state.rawText.length > LIMITS.maxTextLength)
const numberFormat = new Intl.NumberFormat('fr-FR')

// --- Import from a link ------------------------------------------------------

const importField = ref(props.importUrl ?? '')
const importing = ref(false)
const importError = ref<string | null>(null)

async function importFromUrl() {
  const url = importField.value.trim()
  if (!url || importing.value) return
  importing.value = true
  importError.value = null
  try {
    const offer = await $fetch<ImportedOffer>('/api/offers/import-url', {
      method: 'POST',
      body: { url },
    })
    Object.assign(state, {
      title: offer.title,
      company: offer.company,
      url: offer.url,
      rawText: offer.rawText,
    })
    toast.add({
      title: 'Annonce importée',
      description: 'Relis les champs, puis enregistre.',
      icon: 'i-lucide-download',
    })
  } catch (err) {
    importError.value = apiErrorMessage(err, "Impossible d'importer cette annonce.")
  } finally {
    importing.value = false
  }
}

onMounted(() => {
  if (props.importUrl) void importFromUrl()
})

// --- Save ----------------------------------------------------------------------

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
</script>

<template>
  <UCard :ui="{ header: 'p-5 sm:px-6', body: 'p-5 sm:p-6' }">
    <template #header>
      <h2 class="flex items-center gap-2 text-lg font-semibold text-highlighted">
        <UIcon name="i-lucide-file-plus-2" class="size-5 text-primary" />
        Nouvelle offre
      </h2>
      <p class="mt-1 text-sm text-muted">
        <template v-if="webSearch"
          >Importe l'annonce depuis son lien ou colle son texte :
        </template>
        <template v-else>Colle le texte de l'annonce : </template>
        Claude la compare ensuite à ton CV.
      </p>
    </template>

    <form
      v-if="webSearch"
      class="mb-6 rounded-xl bg-primary/5 p-4 ring-1 ring-primary/15"
      @submit.prevent="importFromUrl"
    >
      <UFormField
        label="Importer depuis un lien"
        description="Piston récupère l'annonce et remplit les champs pour toi."
        :error="importError ?? undefined"
      >
        <div class="flex flex-col gap-2 sm:flex-row">
          <UInput
            v-model="importField"
            type="url"
            inputmode="url"
            icon="i-lucide-link"
            placeholder="https://"
            class="w-full"
            :disabled="importing"
          />
          <UButton
            type="submit"
            label="Importer"
            icon="i-lucide-download"
            :loading="importing"
            :disabled="!importField.trim()"
            class="justify-center"
          />
        </div>
      </UFormField>
      <p v-if="importing" class="mt-3"><StreamingIndicator text="Lecture de l'annonce…" /></p>
    </form>

    <UForm :schema="CreateOfferBody" :state="state" class="space-y-5" @submit="onSubmit">
      <div class="grid gap-5 sm:grid-cols-2">
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
        <UTextarea v-model="state.rawText" :rows="10" autoresize :maxrows="20" class="w-full" />
        <template #help>
          <span :class="tooLong ? 'text-error' : ''" aria-live="polite">
            {{ numberFormat.format(state.rawText.length) }} /
            {{ numberFormat.format(LIMITS.maxTextLength) }} caractères
          </span>
        </template>
      </UFormField>
      <div class="flex flex-col-reverse gap-2 sm:flex-row">
        <UButton
          v-if="cancellable"
          label="Annuler"
          color="neutral"
          variant="ghost"
          class="justify-center"
          @click="emit('cancel')"
        />
        <UButton
          type="submit"
          label="Enregistrer et analyser"
          icon="i-lucide-sparkles"
          size="lg"
          class="justify-center"
          :loading="submitting"
          :disabled="tooLong || importing"
        />
      </div>
    </UForm>
  </UCard>
</template>
