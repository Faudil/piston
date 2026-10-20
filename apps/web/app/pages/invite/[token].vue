<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { RegisterBody } from '@piston/shared'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Créer un compte' })

const route = useRoute()
const token = String(route.params.token)
const { fetch: refreshSession } = useUserSession()

const { data: invite } = await useFetch(`/api/invites/${encodeURIComponent(token)}`)

const state = reactive({ token, email: '', displayName: '', password: '' })
const error = ref<string | null>(null)
const loading = ref(false)
const hydrated = useHydrated()

async function onSubmit(event: FormSubmitEvent<RegisterBody>) {
  loading.value = true
  error.value = null
  try {
    await $fetch('/api/auth/register', { method: 'POST', body: event.data })
    await refreshSession()
    await navigateTo('/cv')
  } catch (err) {
    error.value = apiErrorMessage(err, 'Création du compte impossible.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <h1 class="mb-1 text-lg font-semibold">Créer ton compte</h1>
    <template v-if="invite?.valid">
      <p class="mb-4 text-sm text-muted">Tu as été invité·e sur Piston. Bienvenue !</p>
      <UForm :schema="RegisterBody" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="Prénom ou pseudo" name="displayName">
          <UInput v-model="state.displayName" autocomplete="given-name" class="w-full" />
        </UFormField>
        <UFormField label="E-mail" name="email">
          <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
        </UFormField>
        <UFormField label="Mot de passe" name="password" help="10 caractères minimum.">
          <UInput
            v-model="state.password"
            type="password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <UAlert v-if="error" color="error" variant="subtle" :title="error" />
        <UButton
          type="submit"
          label="Créer mon compte"
          block
          :loading="loading"
          :disabled="!hydrated"
        />
      </UForm>
    </template>
    <UAlert
      v-else
      color="warning"
      variant="subtle"
      title="Ce lien d'invitation est invalide ou a expiré."
      description="Demande un nouveau lien à la personne qui t'a invité·e."
    />
  </UCard>
</template>
