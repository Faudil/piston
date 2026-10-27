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
const admin = useAdminBadge()
const more = computed(() => [
  { label: 'Lettres', icon: 'i-lucide-pen-line', to: '/lettres' },
  { label: 'Pistes', icon: 'i-lucide-compass', to: '/pistes' },
  { label: 'Historique', icon: 'i-lucide-history', to: '/historique' },
  ...(admin.isAdmin.value
    ? [
        {
          label:
            admin.pending.value > 0 ? `Administration (${admin.pending.value})` : 'Administration',
          icon: 'i-lucide-shield-check',
          to: '/admin',
        },
      ]
    : []),
])

// The CV editor has its own action bar on phones, in this one's place.
const hidden = computed(() => route.path.startsWith('/cv/editeur/'))

const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))
const moreActive = computed(() => more.value.some((item) => isActive(item.to)))

// « Installer l'application »: the native prompt, or iOS instructions in a dialog.
const installPrompt = useInstallPrompt()
const iosHelpOpen = ref(false)

const installItems = computed<DropdownMenuItem[][]>(() =>
  installPrompt.available.value
    ? [
        [
          {
            label: 'Installer l’application',
            icon: 'i-lucide-smartphone',
            onSelect: () => {
              if (installPrompt.needsInstructions.value)
                afterMenuCloses(() => (iosHelpOpen.value = true))
              else void installPrompt.install()
            },
          },
        ],
      ]
    : [],
)

const moreItems = computed<DropdownMenuItem[][]>(() => [
  more.value.map((item) => ({ ...item, active: isActive(item.to) })),
  ...installItems.value,
  ...accountItems.value,
])
</script>

<template>
  <nav
    v-if="!hidden"
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
    <UModal
      v-model:open="iosHelpOpen"
      title="Installer Piston"
      description="Ajoute Piston à ton écran d’accueil pour l’ouvrir comme une application."
    >
      <template #body>
        <ol class="space-y-3 text-sm">
          <li class="flex items-center gap-3">
            <UIcon name="i-lucide-share" class="size-5 shrink-0 text-primary" />
            <span>Touche <strong>Partager</strong> dans la barre de Safari.</span>
          </li>
          <li class="flex items-center gap-3">
            <UIcon name="i-lucide-square-plus" class="size-5 shrink-0 text-primary" />
            <span>Choisis <strong>Sur l’écran d’accueil</strong>.</span>
          </li>
          <li class="flex items-center gap-3">
            <UIcon name="i-lucide-check" class="size-5 shrink-0 text-primary" />
            <span>Valide avec <strong>Ajouter</strong>.</span>
          </li>
        </ol>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Ne plus proposer"
            color="neutral"
            variant="ghost"
            @click="(installPrompt.dismiss(), (iosHelpOpen = false))"
          />
          <UButton label="Compris" @click="iosHelpOpen = false" />
        </div>
      </template>
    </UModal>
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
