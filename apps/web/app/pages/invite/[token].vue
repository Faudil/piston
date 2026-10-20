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
  <UCard v-if="invite?.valid" :ui="{ body: 'p-6 sm:p-8' }">
    <h1 class="text-3xl font-semibold text-highlighted">Bienvenue !</h1>
    <p class="mt-1 mb-6 text-sm text-muted">
      Tu as été invité·e sur Piston. Crée ton compte en trente secondes.
    </p>
    <UForm :schema="RegisterBody" :state="state" class="space-y-5" @submit="onSubmit">
      <UFormField label="Prénom ou pseudo" name="displayName">
        <UInput
          v-model="state.displayName"
          autocomplete="given-name"
          size="lg"
          icon="i-lucide-user"
          class="w-full"
        />
      </UFormField>
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
      <UFormField label="Mot de passe" name="password" help="10 caractères minimum.">
        <UInput
          v-model="state.password"
          type="password"
          autocomplete="new-password"
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
        label="Créer mon compte"
        size="lg"
        block
        :loading="loading"
        :disabled="!hydrated"
      />
    </UForm>
  </UCard>

  <UEmpty
    v-else
    icon="i-lucide-link-2-off"
    title="Ce lien d'invitation est invalide ou a expiré."
    description="Demande un nouveau lien à la personne qui t'a invité·e : chaque lien ne sert qu'une fois et reste valable 7 jours."
    :actions="[
      { label: 'J\'ai déjà un compte', to: '/login', color: 'neutral', variant: 'outline' },
    ]"
    :ui="{ root: 'shadow-xs' }"
  />
</template>
