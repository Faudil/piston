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
  <UModal
    v-model:open="open"
    title="Nouvelle candidature"
    description="Choisis l'offre à suivre dans ton tableau."
  >
    <template #body>
      <div v-if="loading" class="space-y-2" aria-label="Chargement de tes offres…">
        <USkeleton class="h-4 w-24" />
        <USkeleton class="h-9 w-full" />
      </div>
      <UEmpty
        v-else-if="!items.length"
        icon="i-lucide-briefcase"
        title="Aucune offre disponible"
        description="Toutes tes offres sont déjà suivies. Ajoute une nouvelle offre pour créer une candidature."
        variant="naked"
        :actions="[{ label: 'Ajouter une offre', icon: 'i-lucide-plus', to: '/offres?new=1' }]"
      />
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
