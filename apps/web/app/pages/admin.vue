<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'

/**
 * Administration: access requests to review, members, invitations and the
 * totals. Reachable by admins only (app middleware for the page, requireAdmin
 * on every /api/admin route).
 */
useSeoMeta({ title: 'Administration' })

const route = useRoute()
const router = useRouter()
const admin = useAdminBadge()

const tabs = ['apercu', 'demandes', 'membres', 'invitations'] as const
type Tab = (typeof tabs)[number]

// The tab lives in the URL (?onglet=membres), so a reload or a shared link keeps it.
const tab = computed<Tab>({
  get: () => {
    const value = route.query.onglet
    return tabs.includes(value as Tab) ? (value as Tab) : 'apercu'
  },
  set: (value) => router.replace({ query: { ...route.query, onglet: value } }),
})

const overview = useFetch('/api/admin/overview', { server: false })
const requests = useFetch('/api/admin/access-requests', { server: false })
const users = useFetch('/api/admin/users', { server: false })
const invites = useFetch('/api/admin/invites', { server: false })

const pendingCount = computed(
  () => requests.data.value?.filter((request) => request.status === 'pending').length ?? 0,
)

const items = computed<TabsItem[]>(() => [
  { label: 'Aperçu', icon: 'i-lucide-chart-column', value: 'apercu' },
  {
    label: 'Demandes',
    icon: 'i-lucide-inbox',
    value: 'demandes',
    badge: pendingCount.value ? String(pendingCount.value) : undefined,
  },
  { label: 'Membres', icon: 'i-lucide-users', value: 'membres' },
  { label: 'Invitations', icon: 'i-lucide-link', value: 'invitations' },
])

// Approving a request changes the members, the totals and the nav badge too.
async function refreshAll() {
  await Promise.all([
    overview.refresh(),
    requests.refresh(),
    users.refresh(),
    invites.refresh(),
    admin.refresh(),
  ])
}

const error = computed(
  () => overview.error.value ?? requests.error.value ?? users.error.value ?? invites.error.value,
)
</script>

<template>
  <AppPage
    title="Administration"
    description="Les demandes d’accès, les membres, les invitations et la consommation du serveur."
  >
    <template #actions>
      <UButton
        icon="i-lucide-refresh-cw"
        label="Actualiser"
        color="neutral"
        variant="outline"
        @click="refreshAll"
      />
    </template>

    <UTabs
      v-model="tab"
      :items="items"
      :content="false"
      variant="link"
      class="mb-6 w-full"
      :ui="{
        list: 'overflow-x-auto overflow-y-hidden [scrollbar-width:none]',
        trigger: 'shrink-0',
      }"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="apiErrorMessage(error, 'Impossible de charger l’administration.')"
      class="mb-6"
    />

    <template v-if="tab === 'apercu'">
      <AdminOverview v-if="overview.data.value" :overview="overview.data.value" />
      <USkeleton v-else class="h-96 w-full" />
    </template>
    <template v-else-if="tab === 'demandes'">
      <AdminRequests
        v-if="requests.data.value"
        :requests="requests.data.value"
        @changed="refreshAll"
      />
      <USkeleton v-else class="h-48 w-full" />
    </template>
    <template v-else-if="tab === 'membres'">
      <AdminMembers v-if="users.data.value" :users="users.data.value" @changed="refreshAll" />
      <USkeleton v-else class="h-96 w-full" />
    </template>
    <template v-else>
      <AdminInvites v-if="invites.data.value" :invites="invites.data.value" @changed="refreshAll" />
      <USkeleton v-else class="h-48 w-full" />
    </template>
  </AppPage>
</template>
