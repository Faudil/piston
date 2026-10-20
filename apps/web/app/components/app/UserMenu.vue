<script setup lang="ts">
/** Bottom of the desktop sidebar: avatar + name, opening the account menu. */
defineProps<{ collapsed?: boolean }>()

const { user, initials, accountItems } = useAccountActions()
</script>

<template>
  <UDropdownMenu
    :items="accountItems"
    :content="{ align: 'start', side: 'top', sideOffset: 8 }"
    :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width) min-w-56' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="justify-start gap-3 py-2 data-[state=open]:bg-elevated"
      :aria-label="collapsed ? `Compte de ${user?.displayName}` : undefined"
    >
      <span
        class="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
        aria-hidden="true"
      >
        {{ initials }}
      </span>
      <span v-if="!collapsed" class="min-w-0 flex-1 text-left">
        <span class="block truncate text-sm font-medium text-highlighted">
          {{ user?.displayName }}
        </span>
        <span class="block truncate text-xs text-muted">{{ user?.email }}</span>
      </span>
      <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="size-4 text-dimmed" />
    </UButton>
  </UDropdownMenu>
</template>
