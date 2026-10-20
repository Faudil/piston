<!-- Bare layout for the login and sign-up pages. -->
<template>
  <div class="flex min-h-dvh items-center justify-center bg-muted p-4">
    <div class="w-full max-w-sm">
      <div class="mb-6 flex items-center justify-center gap-2">
        <UIcon name="i-lucide-cog" class="size-7 text-primary" />
        <span class="text-2xl font-semibold">Piston</span>
      </div>
      <slot />
    </div>
  </div>
</template>
