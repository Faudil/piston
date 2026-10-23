<script setup lang="ts">
import { CV_LIMITS, newCvId, type CvHeader } from '@piston/shared'
import type { CvPhotoController } from '~/composables/useCvPhoto'

/** The CV header: name, target title, contact details and links. Edits `header` in place. */
const header = defineModel<CvHeader>({ required: true })
defineProps<{ photo: CvPhotoController }>()

function addLink() {
  header.value.links.push({ id: newCvId(), label: '', url: '' })
}

function removeLink(index: number) {
  header.value.links.splice(index, 1)
}
</script>

<template>
  <div class="space-y-4">
    <CvEditorsPhoto :photo="photo" />

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Nom complet" required data-cv-id="header.fullName">
        <UInput
          v-model="header.fullName"
          class="w-full"
          :maxlength="CV_LIMITS.shortText"
          autocomplete="name"
        />
      </UFormField>
      <UFormField label="Titre visé" hint="Sous ton nom" data-cv-id="header.title">
        <UInput
          v-model="header.title"
          class="w-full"
          :maxlength="CV_LIMITS.shortText"
          placeholder="Ex. : Chargée de communication"
        />
      </UFormField>
      <UFormField label="E-mail" data-cv-id="header.contact">
        <UInput
          v-model="header.email"
          type="email"
          class="w-full"
          :maxlength="CV_LIMITS.shortText"
          autocomplete="email"
        />
      </UFormField>
      <UFormField label="Téléphone" data-cv-id="header.contact">
        <UInput
          v-model="header.phone"
          type="tel"
          class="w-full"
          :maxlength="CV_LIMITS.phone"
          autocomplete="tel"
        />
      </UFormField>
      <UFormField label="Ville" class="sm:col-span-2" data-cv-id="header.contact">
        <UInput
          v-model="header.city"
          class="w-full"
          :maxlength="CV_LIMITS.location"
          autocomplete="address-level2"
          placeholder="Ex. : Lyon"
        />
      </UFormField>
    </div>

    <fieldset class="space-y-3">
      <legend class="text-sm font-medium text-highlighted">Liens</legend>
      <p v-if="!header.links.length" class="text-sm text-muted">
        LinkedIn, portfolio, site personnel… Ils seront cliquables dans le PDF.
      </p>
      <div
        v-for="(link, index) in header.links"
        :key="link.id"
        :data-cv-id="`header.link.${link.id}`"
        class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
      >
        <UFormField :label="`Nom du lien ${index + 1}`" class="col-span-2 sm:col-span-1">
          <UInput
            v-model="link.label"
            class="w-full"
            :maxlength="CV_LIMITS.linkLabel"
            placeholder="LinkedIn"
          />
        </UFormField>
        <UFormField :label="`Adresse du lien ${index + 1}`">
          <UInput
            v-model="link.url"
            type="url"
            class="w-full"
            :maxlength="CV_LIMITS.url"
            placeholder="linkedin.com/in/…"
          />
        </UFormField>
        <UButton
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          class="self-end"
          :aria-label="`Supprimer le lien ${link.label || index + 1}`"
          @click="removeLink(index)"
        />
      </div>
      <UButton
        v-if="header.links.length < CV_LIMITS.links"
        label="Ajouter un lien"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        size="sm"
        @click="addLink"
      />
    </fieldset>
  </div>
</template>
