<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

/**
 * Fixed tab bar for phones (hidden from `lg`, where the sidebar takes over).
 * Four main sections plus a "Plus" menu with the rest and the account actions.
 */
const route = useRoute()
const { accountItems } = useAccountActions()

const tabs = [
  { label: 'Accueil', icon: 'i-lucide-house', to: '/' },
  { label: 'CV', icon: 'i-lucide-file-user', to: '/cv' },
  { label: 'Offres', icon: 'i-lucide-briefcase', to: '/offres' },
  { label: 'Candidatures', icon: 'i-lucide-kanban', to: '/candidatures' },
]
const more = [
  { label: 'Pistes', icon: 'i-lucide-compass', to: '/pistes' },
  { label: 'Historique', icon: 'i-lucide-history', to: '/historique' },
]

const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))
const moreActive = computed(() => more.some((item) => isActive(item.to)))

const moreItems = computed<DropdownMenuItem[][]>(() => [
  more.map((item) => ({ ...item, active: isActive(item.to) })),
  ...accountItems.value,
])
</script>

<template>
  <nav
    aria-label="Navigation principale"
    class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
  >
    <ul class="mx-auto grid h-16 max-w-lg grid-cols-5">
      <li v-for="tab in tabs" :key="tab.to">
        <NuxtLink
          :to="tab.to"
          class="tab"
          :class="isActive(tab.to) ? 'text-primary' : 'text-muted hover:text-highlighted'"
          :aria-current="isActive(tab.to) ? 'page' : undefined"
        >
          <span
            class="grid h-7 w-12 place-items-center rounded-full transition-colors"
            :class="isActive(tab.to) ? 'bg-primary/12' : ''"
          >
            <UIcon :name="tab.icon" class="size-5" />
          </span>
          <span class="max-w-full truncate">{{ tab.label }}</span>
        </NuxtLink>
      </li>
      <li>
        <UDropdownMenu :items="moreItems" :content="{ side: 'top', align: 'end', sideOffset: 8 }">
          <button
            type="button"
            class="tab w-full"
            :class="moreActive ? 'text-primary' : 'text-muted hover:text-highlighted'"
          >
            <span
              class="grid h-7 w-12 place-items-center rounded-full"
              :class="moreActive ? 'bg-primary/12' : ''"
            >
              <UIcon name="i-lucide-ellipsis" class="size-5" />
            </span>
            <span>Plus</span>
          </button>
        </UDropdownMenu>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.tab {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: -0.01em;
  outline: none;
}
.tab:focus-visible > span:first-child {
  box-shadow: 0 0 0 2px var(--ui-primary);
}
</style>
