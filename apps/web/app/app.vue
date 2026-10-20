<script setup lang="ts">
const colorMode = useColorMode()

useHead({
  htmlAttrs: { lang: 'fr' },
  meta: [
    // `viewport-fit=cover` exposes the iPhone safe areas to CSS (env(safe-area-inset-*)),
    // used by the bottom tab bar.
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    // Browser chrome matches the page background (stone-50 / stone-950).
    { name: 'theme-color', content: () => (colorMode.value === 'dark' ? '#0c0a09' : '#fafaf9') },
  ],
})
</script>

<template>
  <UApp :toaster="{ position: 'top-center' }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
