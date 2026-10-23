<script setup lang="ts">
import type { CvShareInfo } from '@piston/shared'

/**
 * Public page of a shared CV (/partage/:token): the PDF in the browser and a
 * download button, no account and no app chrome. Never indexed. A link that
 * was revoked or has expired shows the server's French message.
 */
definePageMeta({ layout: false })
useSeoMeta({ title: 'CV partagé', robots: 'noindex, nofollow' })

const route = useRoute()
const token = encodeURIComponent(String(route.params.token))
const { data: info, error } = await useFetch<CvShareInfo>(`/api/partage/${token}/info`)
const message = computed(() =>
  error.value ? apiErrorMessage(error.value, 'Ce lien ne fonctionne pas.') : null,
)
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
    <div v-if="message || !info" class="m-auto max-w-md space-y-3 text-center">
      <UIcon name="i-lucide-link-2-off" class="mx-auto size-10 text-muted" />
      <h1 class="text-xl font-semibold text-highlighted">Ce CV n’est pas disponible</h1>
      <p class="text-muted" role="alert">{{ message }}</p>
      <p class="text-sm text-muted">Demande un nouveau lien à la personne qui te l’a envoyé.</p>
    </div>
    <template v-else>
      <header class="flex flex-wrap items-center gap-3">
        <h1 class="mr-auto min-w-0 truncate text-xl font-semibold text-highlighted">
          CV de {{ info.title }}
        </h1>
        <UButton
          label="Télécharger le PDF"
          icon="i-lucide-download"
          :href="`/api/partage/${token}?download=1`"
          external
        />
      </header>
      <CvPdfPreview :src="`/api/partage/${token}`" :label="`CV de ${info.title}`" />
      <p class="text-center text-xs text-muted">Partagé avec Piston.</p>
    </template>
  </main>
</template>
