<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { LIMITS, UpdateOfferBody, type JobOffer } from '@piston/shared'

/**
 * « Modifier » and « Supprimer » of an offer page: an edit modal prefilled
 * with the offer, and a delete confirmation (its application goes with it).
 */
const props = defineProps<{ offer: JobOffer }>()
const emit = defineEmits<{ updated: [offer: JobOffer]; deleted: [] }>()

const toast = useToast()
const editOpen = ref(false)
const deleteOpen = ref(false)
const busy = ref(false)

const state = reactive({ title: '', company: '', url: '', rawText: '' })

function openEdit() {
  Object.assign(state, {
    title: props.offer.title,
    company: props.offer.company,
    url: props.offer.url ?? '',
    rawText: props.offer.rawText,
  })
  editOpen.value = true
}

async function save(event: FormSubmitEvent<UpdateOfferBody>) {
  busy.value = true
  try {
    const offer = await $fetch<JobOffer>(`/api/offers/${props.offer.id}`, {
      method: 'PATCH',
      body: event.data,
    })
    editOpen.value = false
    emit('updated', offer)
    toast.add({ title: 'Offre modifiée', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    busy.value = false
  }
}

async function remove() {
  busy.value = true
  try {
    await $fetch(`/api/offers/${props.offer.id}`, { method: 'DELETE' })
    deleteOpen.value = false
    emit('deleted')
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    busy.value = false
  }
}

const items = [
  [{ label: 'Modifier', icon: 'i-lucide-pencil', onSelect: openEdit }],
  [
    {
      label: 'Supprimer',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => (deleteOpen.value = true),
    },
  ],
]
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton
      icon="i-lucide-ellipsis"
      color="neutral"
      variant="outline"
      aria-label="Plus d'actions sur l'offre"
    />
  </UDropdownMenu>

  <UModal
    v-model:open="editOpen"
    title="Modifier l'offre"
    description="Corrige le texte ou les infos de l'annonce."
  >
    <template #body>
      <UForm :schema="UpdateOfferBody" :state="state" class="space-y-4" @submit="save">
        <UFormField label="Intitulé du poste" name="title" required>
          <UInput v-model="state.title" class="w-full" />
        </UFormField>
        <UFormField label="Entreprise" name="company">
          <UInput v-model="state.company" class="w-full" />
        </UFormField>
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
          <UTextarea v-model="state.rawText" :rows="8" autoresize :maxrows="16" class="w-full" />
          <template #help
            >{{ state.rawText.length }} / {{ LIMITS.maxTextLength }} caractères</template
          >
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="ghost" @click="editOpen = false" />
          <UButton type="submit" label="Enregistrer" :loading="busy" />
        </div>
      </UForm>
    </template>
  </UModal>

  <UModal
    v-model:open="deleteOpen"
    title="Supprimer cette offre ?"
    description="Sa candidature associée sera aussi supprimée. Cette action est définitive."
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Annuler" color="neutral" variant="ghost" @click="deleteOpen = false" />
        <UButton
          label="Supprimer"
          color="error"
          icon="i-lucide-trash-2"
          :loading="busy"
          @click="remove"
        />
      </div>
    </template>
  </UModal>
</template>
