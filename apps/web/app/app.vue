<script setup lang="ts">
useHead({
  titleTemplate: (title) => (title ? `${title} — Piston` : 'Piston'),
  htmlAttrs: { lang: 'fr' },
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
