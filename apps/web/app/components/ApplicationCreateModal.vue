<script setup lang="ts">
import type { Application, JobOffer } from '@piston/shared'

const props = defineProps<{ trackedOfferIds: string[] }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [application: Application] }>()

const toast = useToast()
const offers = ref<JobOffer[]>([])
const loading = ref(false)
const selected = ref<string>()
const submitting = ref(false)

// Offers already on the board would be rejected with a 409: do not propose them.
const items = computed(() =>
  offers.value
    .filter((o) => !props.trackedOfferIds.includes(o.id))
    .map((o) => ({ label: `${o.title} — ${o.company}`, value: o.id })),
)

// Load the offers only when the modal opens, so the board loads fast.
watch(open, async (isOpen) => {
  if (!isOpen) return
  selected.value = undefined
  loading.value = true
  try {
    offers.value = await $fetch<JobOffer[]>('/api/offers')
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), color: 'error' })
  } finally {
    loading.value = false
  }
})

async function submit() {
  if (!selected.value) return
  submitting.value = true
  try {
    const created = await $fetch<Application>('/api/applications', {
      method: 'POST',
      body: { jobOfferId: selected.value },
    })
    emit('created', created)
    open.value = false
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Nouvelle candidature">
    <template #body>
      <p v-if="loading" class="text-muted">Chargement de tes offres…</p>
      <div v-else-if="!items.length" class="space-y-3">
        <p class="text-muted">Tu n'as aucune offre disponible à ajouter.</p>
        <UButton to="/offres?new=1" label="Ajouter une offre" icon="i-lucide-plus" />
      </div>
      <UFormField v-else label="Offre">
        <USelect v-model="selected" :items="items" placeholder="Choisis une offre" class="w-full" />
      </UFormField>
    </template>
    <template #footer>
      <UButton label="Annuler" color="neutral" variant="ghost" @click="open = false" />
      <UButton label="Créer" :disabled="!selected" :loading="submitting" @click="submit" />
    </template>
  </UModal>
</template>
