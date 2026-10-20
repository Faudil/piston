<!--
  Layout of the login and sign-up pages: brand panel on the left from `lg`,
  the form (page content) on the right. On phones, a centered card.
-->
<script setup lang="ts">
const features = [
  { icon: 'i-lucide-file-search', text: 'Une critique franche de ton CV, ligne par ligne.' },
  { icon: 'i-lucide-target', text: 'Chaque offre comparée à ton profil, avec un score clair.' },
  { icon: 'i-lucide-kanban', text: 'Tes candidatures suivies sans tableur.' },
]
</script>

<template>
  <div class="grid min-h-dvh bg-canvas lg:grid-cols-[1.1fr_1fr]">
    <aside
      class="relative hidden overflow-hidden bg-neutral-900 p-12 text-white lg:flex lg:flex-col lg:justify-between"
    >
      <!-- Soft orange glow, purely decorative. -->
      <div
        class="pointer-events-none absolute -top-32 -left-24 size-[32rem] rounded-full bg-piston-600/35 blur-3xl"
        aria-hidden="true"
      />
      <div
        class="pointer-events-none absolute -right-24 -bottom-40 size-[28rem] rounded-full bg-piston-400/15 blur-3xl"
        aria-hidden="true"
      />

      <AppLogo class="relative [&_span]:text-white" />

      <div class="relative max-w-md space-y-8">
        <p class="font-display text-5xl leading-[1.1] font-medium text-balance">
          Ton copilote de recherche d'emploi
        </p>
        <ul class="space-y-4">
          <li v-for="feature in features" :key="feature.icon" class="flex items-start gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10">
              <UIcon :name="feature.icon" class="size-5 text-piston-300" />
            </span>
            <span class="pt-1.5 text-neutral-200">{{ feature.text }}</span>
          </li>
        </ul>
      </div>

      <p class="relative text-sm text-neutral-400">Privé, sur invitation, auto-hébergé.</p>
    </aside>

    <main class="flex items-center justify-center p-4 sm:p-8">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
          <AppLogo />
          <p class="text-sm text-muted">Ton copilote de recherche d'emploi</p>
        </div>
        <slot />
      </div>
    </main>
  </div>
</template>
