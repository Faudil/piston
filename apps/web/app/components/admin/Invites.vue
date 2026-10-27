<script setup lang="ts">
import type { AdminInvite } from '@piston/shared'

/** Invitation links: create one outside the weekly quota, revoke unused ones. */
defineProps<{ invites: AdminInvite[] }>()
const emit = defineEmits<{ changed: [] }>()

const toast = useToast()
const creating = ref(false)
const revoking = ref<string | null>(null)

const statusBadge = {
  active: { label: 'Active', color: 'success' },
  used: { label: 'Utilisée', color: 'neutral' },
  expired: { label: 'Expirée', color: 'warning' },
} as const

async function create() {
  creating.value = true
  try {
    const { url } = await $fetch('/api/admin/invites', { method: 'POST' })
    await navigator.clipboard.writeText(url)
    toast.add({
      title: "Lien d'invitation copié",
      description: 'Valable 7 jours, pour une seule personne.',
      icon: 'i-lucide-link',
    })
    emit('changed')
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    creating.value = false
  }
}

async function revoke(invite: AdminInvite) {
  revoking.value = invite.id
  try {
    await $fetch(`/api/admin/invites/${invite.id}`, { method: 'DELETE' })
    toast.add({ title: 'Invitation révoquée', icon: 'i-lucide-link-2-off' })
    emit('changed')
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    revoking.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="max-w-prose text-sm text-muted">
        Les liens ne sont jamais réaffichés : seul celui que tu crées est copié. Révoque un lien
        envoyé par erreur tant qu’il n’a pas servi.
      </p>
      <UButton
        label="Créer un lien d’invitation"
        icon="i-lucide-user-plus"
        :loading="creating"
        @click="create"
      />
    </div>

    <UEmpty
      v-if="invites.length === 0"
      icon="i-lucide-link"
      title="Aucune invitation pour l’instant"
      :ui="{ root: 'shadow-xs' }"
    />
    <UCard v-else :ui="{ body: 'p-0 sm:p-0' }">
      <ul class="divide-y divide-default">
        <li
          v-for="invite in invites"
          :key="invite.id"
          class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-sm sm:px-5"
        >
          <div class="min-w-0">
            <p class="text-highlighted">
              Créée le {{ formatDate(invite.createdAt) }}
              <span class="text-muted">par {{ invite.createdBy ?? 'la ligne de commande' }}</span>
            </p>
            <p class="text-xs text-muted">
              <template v-if="invite.usedAt">Utilisée le {{ formatDate(invite.usedAt) }}</template>
              <template v-else>Expire le {{ formatDate(invite.expiresAt) }}</template>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UBadge
              :label="statusBadge[invite.status].label"
              :color="statusBadge[invite.status].color"
              variant="subtle"
            />
            <UButton
              v-if="invite.status === 'active'"
              label="Révoquer"
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-lucide-link-2-off"
              :loading="revoking === invite.id"
              @click="revoke(invite)"
            />
          </div>
        </li>
      </ul>
    </UCard>
  </div>
</template>
