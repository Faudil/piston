<script setup lang="ts">
import {
  applicationStatusLabels,
  type Application,
  type UpdateApplicationBody,
} from '@piston/shared'

const props = defineProps<{ application: Application; saving: boolean }>()
const emit = defineEmits<{ save: [patch: UpdateApplicationBody] }>()

// Local copy so typing does not touch the board until the user saves.
const notes = ref(props.application.notes)
watch(
  () => props.application.id,
  () => (notes.value = props.application.notes),
)

const outcomeItems = [
  { label: 'Pas encore de réponse', value: 'none' },
  { label: outcomeLabels.accepted, value: 'accepted' },
  { label: outcomeLabels.rejected, value: 'rejected' },
]
const outcome = computed({
  get: () => props.application.outcome ?? 'none',
  set: (value: string) =>
    emit('save', { outcome: value === 'none' ? null : (value as 'accepted' | 'rejected') }),
})
</script>

<template>
  <div class="space-y-6">
    <UButton
      :to="`/offres/${application.offer.id}`"
      icon="i-lucide-briefcase"
      label="Voir l'offre"
      color="neutral"
      variant="outline"
    />

    <UFormField v-if="application.status === 'closed'" label="Résultat">
      <USelect v-model="outcome" :items="outcomeItems" class="w-full" />
    </UFormField>

    <UFormField label="Notes">
      <UTextarea v-model="notes" :rows="6" :maxlength="5000" autoresize class="w-full" />
    </UFormField>
    <UButton
      label="Enregistrer les notes"
      :loading="saving"
      :disabled="notes === application.notes"
      @click="emit('save', { notes })"
    />

    <section>
      <h3 class="mb-3 font-semibold">Historique</h3>
      <ol class="space-y-2 border-l border-default pl-4">
        <li v-for="change in application.statusHistory" :key="change.at + change.status">
          <span class="font-medium">{{ applicationStatusLabels[change.status] }}</span>
          <time class="block text-sm text-muted" :datetime="change.at">
            {{ formatDateTime(change.at) }}
          </time>
        </li>
      </ol>
    </section>
  </div>
</template>
