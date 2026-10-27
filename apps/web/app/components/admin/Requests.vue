<script setup lang="ts">
import type { AdminAccessRequest } from '@piston/shared'

/** Access requests: the pending ones to review, then the reviewed history. */
const props = defineProps<{ requests: AdminAccessRequest[] }>()
const emit = defineEmits<{ changed: [] }>()

const toast = useToast()
const busy = ref<string | null>(null)

const pending = computed(() => props.requests.filter((request) => request.status === 'pending'))
const reviewed = computed(() => props.requests.filter((request) => request.status !== 'pending'))

async function review(request: AdminAccessRequest, action: 'approve' | 'reject') {
  busy.value = request.id
  try {
    await $fetch(`/api/admin/access-requests/${request.id}/${action}`, { method: 'POST' })
    toast.add(
      action === 'approve'
        ? {
            title: `${request.displayName} peut se connecter`,
            description: `Son compte ${request.email} est actif : tu peux le lui dire.`,
            icon: 'i-lucide-user-check',
          }
        : { title: 'Demande refusée', icon: 'i-lucide-user-x' },
    )
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busy.value = null
    emit('changed')
  }
}
</script>

<template>
  <div class="space-y-8">
    <section class="space-y-3">
      <AppSectionHeading
        id="pending-requests"
        title="À traiter"
        :description="
          pending.length
            ? `${pending.length} demande${pending.length > 1 ? 's' : ''} en attente`
            : undefined
        "
      />
      <UEmpty
        v-if="pending.length === 0"
        icon="i-lucide-inbox"
        title="Aucune demande en attente"
        description="Les demandes envoyées depuis la page « Demander un accès » apparaîtront ici."
        :ui="{ root: 'shadow-xs' }"
      />
      <UCard v-for="request in pending" :key="request.id" :ui="{ body: 'p-4 sm:p-5' }">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0 space-y-1">
            <p class="font-medium text-highlighted">{{ request.displayName }}</p>
            <p class="truncate text-sm text-muted">{{ request.email }}</p>
            <p class="text-xs text-dimmed">
              Demandé
              <time :datetime="request.createdAt" :title="formatDateTime(request.createdAt)">
                {{ formatRelative(request.createdAt) }}
              </time>
            </p>
            <blockquote
              v-if="request.message"
              class="mt-2 border-l-2 border-primary/40 pl-3 text-sm whitespace-pre-line text-default"
            >
              {{ request.message }}
            </blockquote>
          </div>
          <div class="flex shrink-0 gap-2">
            <UButton
              label="Refuser"
              color="neutral"
              variant="outline"
              icon="i-lucide-x"
              :disabled="busy !== null"
              :loading="busy === request.id"
              @click="review(request, 'reject')"
            />
            <UButton
              label="Accepter"
              icon="i-lucide-check"
              :disabled="busy !== null"
              :loading="busy === request.id"
              @click="review(request, 'approve')"
            />
          </div>
        </div>
      </UCard>
    </section>

    <section v-if="reviewed.length" class="space-y-3">
      <AppSectionHeading id="reviewed-requests" title="Déjà traitées" />
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li
            v-for="request in reviewed"
            :key="request.id"
            class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm sm:px-5"
          >
            <div class="min-w-0">
              <span class="font-medium text-highlighted">{{ request.displayName }}</span>
              <span class="ml-2 text-muted">{{ request.email }}</span>
            </div>
            <div class="flex items-center gap-3 text-xs text-muted">
              <span v-if="request.reviewedAt">
                {{ formatDate(request.reviewedAt) }}
                <template v-if="request.reviewedBy">par {{ request.reviewedBy }}</template>
              </span>
              <UBadge
                :label="request.status === 'approved' ? 'Acceptée' : 'Refusée'"
                :color="request.status === 'approved' ? 'success' : 'neutral'"
                variant="subtle"
              />
            </div>
          </li>
        </ul>
      </UCard>
    </section>
  </div>
</template>
