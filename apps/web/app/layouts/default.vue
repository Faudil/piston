<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { user, clear } = useUserSession()
const toast = useToast()

const links: NavigationMenuItem[] = [
  { label: 'Accueil', icon: 'i-lucide-house', to: '/' },
  { label: 'CV', icon: 'i-lucide-file-user', to: '/cv' },
  { label: 'Offres', icon: 'i-lucide-briefcase', to: '/offres' },
  { label: 'Candidatures', icon: 'i-lucide-kanban', to: '/candidatures' },
  { label: 'Pistes', icon: 'i-lucide-compass', to: '/pistes' },
  { label: 'Historique', icon: 'i-lucide-history', to: '/historique' },
]

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}

async function invite() {
  try {
    const { url } = await $fetch('/api/invites', { method: 'POST' })
    await navigator.clipboard.writeText(url)
    toast.add({
      title: "Lien d'invitation copié",
      description: 'Valable 7 jours, pour une seule personne.',
      icon: 'i-lucide-link',
    })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), color: 'error' })
  }
}
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible :ui="{ footer: 'flex-col items-stretch gap-1' }">
      <template #header>
        <NuxtLink to="/" class="flex items-center gap-2 px-2 font-semibold">
          <UIcon name="i-lucide-cog" class="size-5 text-primary" />
          Piston
        </NuxtLink>
      </template>

      <UNavigationMenu :items="links" orientation="vertical" />

      <template #footer>
        <UButton
          label="Inviter un ami"
          icon="i-lucide-user-plus"
          color="neutral"
          variant="ghost"
          block
          class="justify-start"
          @click="invite"
        />
        <UButton
          :label="`Déconnexion (${user?.displayName})`"
          icon="i-lucide-log-out"
          color="neutral"
          variant="ghost"
          block
          class="justify-start"
          @click="logout"
        />
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
