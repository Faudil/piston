<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { AccessRequestBody } from '@piston/shared'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Demander un accès' })

const state = reactive({ displayName: '', email: '', password: '', message: '' })
const error = ref<string | null>(null)
const loading = ref(false)
const sent = ref(false)
const hydrated = useHydrated()

async function onSubmit(event: FormSubmitEvent<AccessRequestBody>) {
  loading.value = true
  error.value = null
  try {
    await $fetch('/api/access-requests', { method: 'POST', body: event.data })
    sent.value = true
  } catch (err) {
    error.value = apiErrorMessage(err, 'Impossible d’envoyer la demande.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard v-if="!sent" :ui="{ body: 'p-6 sm:p-8' }">
    <h1 class="text-3xl font-semibold text-highlighted">Demander un accès</h1>
    <p class="mt-1 mb-6 text-sm text-muted">
      Piston est réservé à un petit groupe. Choisis ton mot de passe dès maintenant : tu pourras te
      connecter dès que ta demande sera acceptée.
    </p>
    <UForm :schema="AccessRequestBody" :state="state" class="space-y-5" @submit="onSubmit">
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
      <UFormField
        label="Un mot pour l’administrateur"
        name="message"
        hint="Facultatif"
        help="Qui t’a parlé de Piston, ce que tu cherches…"
      >
        <UTextarea v-model="state.message" :rows="3" :maxlength="500" autoresize class="w-full" />
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
        label="Envoyer ma demande"
        size="lg"
        block
        :loading="loading"
        :disabled="!hydrated"
      />
    </UForm>
    <p class="mt-6 border-t border-default pt-5 text-center text-sm text-muted">
      Déjà un compte ?
      <ULink to="/login" class="font-medium text-primary">Se connecter</ULink>
    </p>
  </UCard>

  <UEmpty
    v-else
    icon="i-lucide-mail-check"
    title="Demande envoyée"
    description="Un administrateur va la regarder. Une fois acceptée, connecte-toi avec ton e-mail et le mot de passe que tu viens de choisir."
    :actions="[{ label: 'Aller à la connexion', to: '/login', icon: 'i-lucide-log-in' }]"
    :ui="{ root: 'shadow-xs' }"
  />
</template>
