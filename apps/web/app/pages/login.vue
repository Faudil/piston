<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { LoginBody } from '@piston/shared'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Connexion' })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()

const state = reactive({ email: '', password: '' })
const error = ref<string | null>(null)
const loading = ref(false)
const hydrated = useHydrated()

async function onSubmit(event: FormSubmitEvent<LoginBody>) {
  loading.value = true
  error.value = null
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: event.data })
    await refreshSession()
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    // Only follow local redirects.
    await navigateTo(redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/')
  } catch (err) {
    error.value = apiErrorMessage(err, 'Connexion impossible.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard :ui="{ body: 'p-6 sm:p-8' }">
    <h1 class="text-3xl font-semibold text-highlighted">Bon retour</h1>
    <p class="mt-1 mb-6 text-sm text-muted">
      Connecte-toi pour reprendre là où tu t'étais arrêté·e.
    </p>

    <UForm :schema="LoginBody" :state="state" class="space-y-5" @submit="onSubmit">
      <UFormField label="E-mail" name="email">
        <UInput
          v-model="state.email"
          type="email"
          autocomplete="email"
          size="lg"
          icon="i-lucide-mail"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Mot de passe" name="password">
        <UInput
          v-model="state.password"
          type="password"
          autocomplete="current-password"
          size="lg"
          icon="i-lucide-lock"
          class="w-full"
        />
      </UFormField>
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="error"
      />
      <UButton
        type="submit"
        label="Se connecter"
        size="lg"
        block
        :loading="loading"
        :disabled="!hydrated"
      />
    </UForm>

    <p class="mt-6 border-t border-default pt-5 text-center text-sm text-muted">
      Pas de compte ? Piston fonctionne sur invitation : demande un lien à un membre.
    </p>
  </UCard>
</template>
