<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const baseLinks: NavigationMenuItem[] = [
  { label: 'Accueil', icon: 'i-lucide-house', to: '/' },
  { label: 'CV', icon: 'i-lucide-file-user', to: '/cv' },
  { label: 'Offres', icon: 'i-lucide-briefcase', to: '/offres' },
  { label: 'Candidatures', icon: 'i-lucide-kanban', to: '/candidatures' },
  { label: 'Lettres', icon: 'i-lucide-pen-line', to: '/lettres' },
  { label: 'Pistes', icon: 'i-lucide-compass', to: '/pistes' },
  { label: 'Historique', icon: 'i-lucide-history', to: '/historique' },
]

const route = useRoute()
const admin = useAdminBadge()
// Admins get one more entry, with the number of access requests waiting.
watch(() => route.path, admin.refresh)
onMounted(admin.refresh)

const links = computed<NavigationMenuItem[][]>(() => [
  baseLinks,
  admin.isAdmin.value
    ? [
        {
          label: 'Administration',
          icon: 'i-lucide-shield-check',
          to: '/admin',
          badge: admin.pending.value > 0 ? String(admin.pending.value) : undefined,
        },
      ]
    : [],
])
</script>

<template>
  <UDashboardGroup unit="rem">
    <!-- Sizes in rem: a fixed, readable sidebar width whatever the screen. -->
    <!-- Desktop only: on phones, AppBottomNav replaces it (hence no toggle button). -->
    <UDashboardSidebar
      collapsible
      :default-size="16"
      :min-size="14"
      :max-size="20"
      :collapsed-size="4.5"
      :toggle="false"
      :ui="{
        root: 'bg-default border-e border-default',
        header: 'h-20 px-5',
        body: 'px-3 py-2',
        footer: 'flex-col items-stretch gap-1 border-t border-default p-3',
      }"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="rounded-lg focus-visible:outline-2 focus-visible:outline-primary">
          <AppLogo :compact="collapsed" />
          <span class="sr-only">Accueil</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :items="links"
          orientation="vertical"
          :collapsed="collapsed"
          tooltip
          :ui="{
            link: 'px-3 py-2 text-[0.9375rem] rounded-lg before:rounded-lg',
            linkLeadingIcon: 'size-5',
          }"
        />
      </template>

      <template #footer="{ collapsed }">
        <AppUserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />

    <AppBottomNav />
  </UDashboardGroup>
</template>
