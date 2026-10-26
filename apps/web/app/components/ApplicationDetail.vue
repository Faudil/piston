<script setup lang="ts">
import {
  applicationStatusLabels,
  type Application,
  type Generation,
  type JobOffer,
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

// For the next-step card: the offer (its resume profile) and its latest letter.
const { data: offer } = useFetch<JobOffer>(() => `/api/offers/${props.application.jobOfferId}`, {
  lazy: true,
  server: false,
})
const { data: letters } = useFetch<Generation<'cover_letter'>[]>(
  () => `/api/offers/${props.application.jobOfferId}/letters`,
  { lazy: true, server: false, default: () => [] },
)

// Newest first: the current status is what the user looks for.
const history = computed(() => [...props.application.statusHistory].reverse())
</script>

<template>
  <div class="space-y-8">
    <div class="flex flex-wrap items-center gap-2">
      <UBadge
        :label="applicationStatusLabels[application.status]"
        :color="statusStyles[application.status].color"
        :icon="statusStyles[application.status].icon"
        variant="subtle"
        size="lg"
      />
    </div>

    <OfferNextSteps
      v-if="offer"
      :offer="offer"
      :application="application"
      :letter-id="letters[0]?.id ?? null"
      :letter-to="`/candidatures/${application.id}/lettre`"
    />
    <USkeleton v-else class="h-40 w-full rounded-2xl" />

    <div class="grid gap-2 sm:grid-cols-2">
      <UButton
        :to="`/candidatures/${application.id}/lettre`"
        icon="i-lucide-pen-line"
        label="Lettre de motivation"
        color="neutral"
        variant="outline"
        block
      />
      <UButton
        :to="`/offres/${application.offer.id}`"
        icon="i-lucide-briefcase"
        label="Voir l'offre"
        color="neutral"
        variant="outline"
        block
      />
    </div>

    <UFormField v-if="application.status === 'closed'" label="Résultat">
      <USelect v-model="outcome" :items="outcomeItems" class="w-full" />
    </UFormField>

    <div class="space-y-3">
      <UFormField label="Notes" help="Contacts, dates de relance, impressions d'entretien…">
        <UTextarea v-model="notes" :rows="6" :maxlength="5000" autoresize class="w-full" />
      </UFormField>
      <UButton
        label="Enregistrer les notes"
        icon="i-lucide-save"
        color="neutral"
        variant="outline"
        :loading="saving"
        :disabled="notes === application.notes"
        @click="emit('save', { notes })"
      />
    </div>

    <section aria-labelledby="application-history">
      <h3 id="application-history" class="mb-4 text-sm font-semibold text-highlighted">
        Historique
      </h3>
      <ol class="relative space-y-4 border-s border-default ps-5">
        <li v-for="change in history" :key="change.at + change.status" class="relative">
          <span
            class="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full ring-4 ring-(--ui-bg)"
            :class="statusStyles[change.status].dot"
            aria-hidden="true"
          />
          <span class="font-medium text-highlighted">
            {{ applicationStatusLabels[change.status] }}
          </span>
          <time class="block text-sm text-muted" :datetime="change.at">
            {{ formatDateTime(change.at) }}
          </time>
        </li>
      </ol>
    </section>
  </div>
</template>
