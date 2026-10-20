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
  <UCard>
    <h1 class="mb-4 text-lg font-semibold">Connexion</h1>
    <UForm :schema="LoginBody" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField label="E-mail" name="email">
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
      </UFormField>
      <UFormField label="Mot de passe" name="password">
        <UInput
          v-model="state.password"
          type="password"
          autocomplete="current-password"
          class="w-full"
        />
      </UFormField>
      <UAlert v-if="error" color="error" variant="subtle" :title="error" />
      <UButton type="submit" label="Se connecter" block :loading="loading" />
    </UForm>
    <p class="mt-4 text-center text-sm text-muted">
      Pas de compte ? Piston fonctionne sur invitation : demande un lien à un membre.
    </p>
  </UCard>
</template>
