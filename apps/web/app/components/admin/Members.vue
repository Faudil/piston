<script setup lang="ts">
import type { AdminUser } from '@piston/shared'

/** Every member with their activity, and the account actions. */
const props = defineProps<{ users: AdminUser[] }>()
const emit = defineEmits<{ changed: [] }>()

const toast = useToast()
const { user: me } = useUserSession()
const search = ref('')
const busy = ref(false)

const dollars = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' })

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return props.users
  return props.users.filter(
    (member) => member.displayName.toLowerCase().includes(query) || member.email.includes(query),
  )
})

// --- Actions ---------------------------------------------------------------------

const deleting = ref<AdminUser | null>(null)
const deleteConfirm = ref('')
const temporaryPassword = ref<{ member: AdminUser; password: string } | null>(null)

async function toggleAdmin(member: AdminUser) {
  busy.value = true
  try {
    await $fetch(`/api/admin/users/${member.id}`, {
      method: 'PATCH',
      body: { isAdmin: !member.isAdmin },
    })
    toast.add({
      title: member.isAdmin
        ? `${member.displayName} n’est plus administrateur`
        : `${member.displayName} est maintenant administrateur`,
      icon: 'i-lucide-shield-check',
    })
    emit('changed')
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busy.value = false
  }
}

async function resetPassword(member: AdminUser) {
  busy.value = true
  try {
    const { password } = await $fetch(`/api/admin/users/${member.id}/reset-password`, {
      method: 'POST',
    })
    afterMenuCloses(() => (temporaryPassword.value = { member, password }))
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busy.value = false
  }
}

async function copyPassword() {
  if (!temporaryPassword.value) return
  await navigator.clipboard.writeText(temporaryPassword.value.password)
  toast.add({ title: 'Mot de passe copié', icon: 'i-lucide-copy' })
}

async function confirmDelete() {
  if (!deleting.value) return
  busy.value = true
  try {
    await $fetch(`/api/admin/users/${deleting.value.id}`, { method: 'DELETE' })
    toast.add({
      title: `Compte de ${deleting.value.displayName} supprimé`,
      icon: 'i-lucide-trash-2',
    })
    deleting.value = null
    emit('changed')
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busy.value = false
  }
}

function menuFor(member: AdminUser) {
  const isMe = member.id === me.value?.id
  return [
    [
      {
        label: member.isAdmin ? 'Retirer le rôle admin' : 'Rendre administrateur',
        icon: member.isAdmin ? 'i-lucide-shield-off' : 'i-lucide-shield-check',
        disabled: isMe,
        onSelect: () => toggleAdmin(member),
      },
      {
        label: 'Réinitialiser le mot de passe',
        icon: 'i-lucide-key-round',
        onSelect: () => resetPassword(member),
      },
    ],
    [
      {
        label: 'Supprimer le compte',
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        disabled: isMe,
        onSelect: () =>
          afterMenuCloses(() => {
            deleteConfirm.value = ''
            deleting.value = member
          }),
      },
    ],
  ]
}
</script>

<template>
  <div class="space-y-4">
    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Chercher un membre…"
      class="w-full sm:max-w-xs"
    />

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <ul class="divide-y divide-default">
        <li
          v-for="member in filtered"
          :key="member.id"
          class="relative flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5"
        >
          <div class="min-w-0 flex-1 pr-10 sm:pr-0">
            <div class="flex items-center gap-2">
              <span class="truncate font-medium text-highlighted">{{ member.displayName }}</span>
              <UBadge v-if="member.isAdmin" label="Admin" size="sm" variant="subtle" />
              <UBadge
                v-if="member.id === me?.id"
                label="Toi"
                size="sm"
                color="neutral"
                variant="subtle"
              />
            </div>
            <p class="truncate text-sm text-muted">{{ member.email }}</p>
            <p class="mt-0.5 text-xs text-dimmed">
              Inscrit·e le {{ formatDate(member.createdAt) }} ·
              <template v-if="member.lastActiveAt">
                actif·ve
                <time :datetime="member.lastActiveAt">{{
                  formatRelative(member.lastActiveAt)
                }}</time>
              </template>
              <template v-else>jamais utilisé l’IA</template>
            </p>
          </div>

          <dl class="grid grid-cols-4 gap-4 text-center text-xs sm:w-96 sm:shrink-0">
            <div>
              <dt class="text-muted">Offres</dt>
              <dd class="text-base font-semibold text-highlighted tabular-nums">
                {{ member.counts.offers }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">Candid.</dt>
              <dd class="text-base font-semibold text-highlighted tabular-nums">
                {{ member.counts.applications }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">IA 30 j</dt>
              <dd class="text-base font-semibold text-highlighted tabular-nums">
                {{ member.claude30d.calls }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">Coût 30 j</dt>
              <dd class="text-base font-semibold text-highlighted tabular-nums">
                {{ dollars.format(member.claude30d.costUsd) }}
              </dd>
            </div>
          </dl>

          <UDropdownMenu :items="menuFor(member)" :content="{ align: 'end' }" :modal="false">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              :aria-label="`Actions pour ${member.displayName}`"
              class="absolute top-3 right-3 sm:static"
            />
          </UDropdownMenu>
        </li>
        <li v-if="filtered.length === 0" class="px-5 py-8 text-center text-sm text-muted">
          Aucun membre ne correspond.
        </li>
      </ul>
    </UCard>

    <UModal
      :open="deleting !== null"
      :title="`Supprimer le compte de ${deleting?.displayName} ?`"
      description="Ses CV, offres, candidatures et lettres seront effacés définitivement. Sa consommation reste comptée dans les quotas."
      @update:open="(open) => !open && (deleting = null)"
    >
      <template #body>
        <UFormField :label="`Tape ${deleting?.email} pour confirmer`">
          <UInput v-model="deleteConfirm" class="w-full" autocomplete="off" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="ghost" @click="deleting = null" />
          <UButton
            label="Supprimer"
            color="error"
            icon="i-lucide-trash-2"
            :loading="busy"
            :disabled="deleteConfirm.trim().toLowerCase() !== deleting?.email"
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>

    <UModal
      :open="temporaryPassword !== null"
      :title="`Nouveau mot de passe de ${temporaryPassword?.member.displayName}`"
      description="Affiché une seule fois. Transmets-le par un canal sûr : la personne pourra le changer dans « Mon compte ». Toutes ses sessions ont été fermées."
      @update:open="(open) => !open && (temporaryPassword = null)"
    >
      <template #body>
        <div class="flex items-center gap-2">
          <code
            class="flex-1 rounded-md bg-elevated px-3 py-2 font-mono text-sm break-all text-highlighted"
          >
            {{ temporaryPassword?.password }}
          </code>
          <UButton icon="i-lucide-copy" label="Copier" variant="outline" @click="copyPassword" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton label="C’est noté" @click="temporaryPassword = null" />
        </div>
      </template>
    </UModal>
  </div>
</template>
