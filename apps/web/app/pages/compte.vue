<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { ChangePasswordBody, UpdateAccountBody } from '@piston/shared'

useSeoMeta({ title: 'Mon compte' })

const toast = useToast()
const { user, fetch: refreshSession, clear } = useUserSession()

// --- Profile -------------------------------------------------------------------

const profile = reactive({ displayName: user.value?.displayName ?? '' })
const savingProfile = ref(false)

async function saveProfile(event: FormSubmitEvent<UpdateAccountBody>) {
  savingProfile.value = true
  try {
    await $fetch('/api/account', { method: 'PATCH', body: event.data })
    await refreshSession()
    toast.add({ title: 'Profil mis à jour', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    savingProfile.value = false
  }
}

// --- Password ------------------------------------------------------------------

const password = reactive({ currentPassword: '', newPassword: '' })
const savingPassword = ref(false)

async function savePassword(event: FormSubmitEvent<ChangePasswordBody>) {
  savingPassword.value = true
  try {
    await $fetch('/api/account/password', { method: 'POST', body: event.data })
    Object.assign(password, { currentPassword: '', newPassword: '' })
    toast.add({ title: 'Mot de passe modifié', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    savingPassword.value = false
  }
}

// --- Danger zone ---------------------------------------------------------------

const confirmEmail = ref('')
const deleting = ref(false)
const canDelete = computed(
  () => confirmEmail.value.trim().toLowerCase() === user.value?.email.toLowerCase(),
)

async function deleteAccount() {
  deleting.value = true
  try {
    await $fetch('/api/account', { method: 'DELETE', body: { confirmEmail: confirmEmail.value } })
    await clear()
    await navigateTo('/login')
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
    deleting.value = false
  }
}
</script>

<template>
  <AppPage
    title="Mon compte"
    description="Ton profil, ton mot de passe et tes données."
    width="narrow"
  >
    <div class="space-y-12">
      <section aria-labelledby="account-profile">
        <AppSectionHeading id="account-profile" title="Profil" icon="i-lucide-user-round" />
        <UCard>
          <UForm
            :schema="UpdateAccountBody"
            :state="profile"
            class="space-y-4"
            @submit="saveProfile"
          >
            <UFormField label="Adresse e-mail" description="Elle ne peut pas être modifiée.">
              <UInput :model-value="user?.email" disabled class="w-full" />
            </UFormField>
            <UFormField label="Nom affiché" name="displayName" required>
              <UInput v-model="profile.displayName" class="w-full" :maxlength="80" />
            </UFormField>
            <UButton type="submit" label="Enregistrer" :loading="savingProfile" />
          </UForm>
        </UCard>
      </section>

      <section aria-labelledby="account-password">
        <AppSectionHeading id="account-password" title="Mot de passe" icon="i-lucide-key-round" />
        <UCard>
          <UForm
            :schema="ChangePasswordBody"
            :state="password"
            class="space-y-4"
            @submit="savePassword"
          >
            <UFormField label="Mot de passe actuel" name="currentPassword" required>
              <UInput
                v-model="password.currentPassword"
                type="password"
                autocomplete="current-password"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Nouveau mot de passe"
              name="newPassword"
              hint="10 caractères minimum"
              required
            >
              <UInput
                v-model="password.newPassword"
                type="password"
                autocomplete="new-password"
                class="w-full"
              />
            </UFormField>
            <UButton type="submit" label="Changer le mot de passe" :loading="savingPassword" />
          </UForm>
        </UCard>
      </section>

      <section aria-labelledby="account-data">
        <AppSectionHeading
          id="account-data"
          title="Mes données"
          icon="i-lucide-database"
          description="Un fichier JSON avec ton profil, tes CV (texte), tes offres, tes analyses et lettres, et tes candidatures. Les PDF se téléchargent depuis la page CV."
        />
        <UButton
          label="Exporter mes données"
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          to="/api/account/export"
          external
          download
        />
      </section>

      <section aria-labelledby="account-danger">
        <AppSectionHeading
          id="account-danger"
          title="Zone dangereuse"
          icon="i-lucide-triangle-alert"
        />
        <UCard class="ring-error/40">
          <div class="space-y-4">
            <p class="text-sm text-toned">
              Supprimer ton compte efface définitivement tes CV (PDF compris), offres, analyses,
              lettres et candidatures. Pense à exporter tes données avant.
            </p>
            <UFormField :label="`Saisis ${user?.email} pour confirmer`" name="confirmEmail">
              <UInput
                v-model="confirmEmail"
                type="email"
                autocomplete="off"
                class="w-full"
                :placeholder="user?.email"
              />
            </UFormField>
            <UButton
              label="Supprimer mon compte"
              icon="i-lucide-trash-2"
              color="error"
              :disabled="!canDelete"
              :loading="deleting"
              @click="deleteAccount"
            />
          </div>
        </UCard>
      </section>
    </div>
  </AppPage>
</template>
