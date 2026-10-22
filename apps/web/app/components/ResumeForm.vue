<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import { CreateResumeBody, LIMITS, type Resume } from '@piston/shared'

const props = defineProps<{
  /** The profile the version is added to. Without it, the default profile (created if needed). */
  profileId?: string
}>()

const emit = defineEmits<{ created: [resume: Resume] }>()

const toast = useToast()

const tabs: TabsItem[] = [
  { label: 'Coller le texte', icon: 'i-lucide-clipboard-paste', slot: 'paste' },
  { label: 'Importer un PDF', icon: 'i-lucide-file-up', slot: 'pdf' },
]

// --- Paste ------------------------------------------------------------------

const pasted = reactive({ title: '', rawText: '' })
const pasting = ref(false)

async function submitPasted() {
  pasting.value = true
  try {
    const resume = await $fetch<Resume>('/api/resumes', {
      method: 'POST',
      body: { ...pasted, profileId: props.profileId },
    })
    Object.assign(pasted, { title: '', rawText: '' })
    toast.add({
      title: 'CV enregistré',
      description: "C'est maintenant la version actuelle de ce profil.",
    })
    emit('created', resume)
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), color: 'error' })
  } finally {
    pasting.value = false
  }
}

// --- PDF import -------------------------------------------------------------

const pdfTitle = ref('')
const pdfFile = ref<File | null>(null)
const importing = ref(false)
const maxPdfMegabytes = LIMITS.maxPdfBytes / 1024 / 1024

// Checked here too so the user gets an answer without uploading 20 MB first;
// the server checks again.
const pdfError = computed(() => {
  if (!pdfFile.value) return undefined
  if (pdfFile.value.size > LIMITS.maxPdfBytes)
    return `Le PDF ne doit pas dépasser ${maxPdfMegabytes} Mo.`
  return undefined
})

async function submitPdf() {
  if (!pdfFile.value || pdfError.value) return
  const form = new FormData()
  form.append('file', pdfFile.value)
  if (pdfTitle.value.trim()) form.append('title', pdfTitle.value.trim())
  if (props.profileId) form.append('profileId', props.profileId)

  importing.value = true
  try {
    const resume = await $fetch<Resume>('/api/resumes/import', { method: 'POST', body: form })
    pdfFile.value = null
    pdfTitle.value = ''
    toast.add({
      title: 'CV importé',
      description: "C'est maintenant la version actuelle de ce profil.",
    })
    emit('created', resume)
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), color: 'error' })
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <UTabs :items="tabs" variant="link" class="w-full">
    <template #paste>
      <UForm
        :schema="CreateResumeBody"
        :state="pasted"
        class="space-y-4 pt-2"
        @submit="submitPasted"
      >
        <UFormField label="Titre" name="title" required>
          <UInput
            v-model="pasted.title"
            placeholder="Ex. : CV développeuse 2026"
            :maxlength="120"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Texte du CV"
          name="rawText"
          required
          :hint="`${pasted.rawText.length.toLocaleString('fr-FR')} / ${LIMITS.maxTextLength.toLocaleString('fr-FR')}`"
        >
          <UTextarea
            v-model="pasted.rawText"
            :rows="12"
            autoresize
            :maxrows="24"
            :maxlength="LIMITS.maxTextLength"
            placeholder="Colle ici tout le texte de ton CV."
            class="w-full"
          />
        </UFormField>
        <UButton type="submit" label="Enregistrer" icon="i-lucide-save" :loading="pasting" />
      </UForm>
    </template>

    <template #pdf>
      <form class="space-y-4 pt-2" @submit.prevent="submitPdf">
        <UFormField
          label="Titre (facultatif)"
          name="pdfTitle"
          hint="Par défaut : le nom du fichier"
        >
          <UInput v-model="pdfTitle" :maxlength="120" class="w-full" />
        </UFormField>
        <UFormField
          label="Fichier PDF"
          name="file"
          :description="`${maxPdfMegabytes} Mo maximum. Le PDF est conservé pour que tu puisses le retélécharger ; Claude en lit le texte.`"
          :error="pdfError"
        >
          <UFileUpload
            v-model="pdfFile"
            accept="application/pdf,.pdf"
            label="Dépose ton CV ici"
            description="ou clique pour choisir un fichier"
            icon="i-lucide-file-text"
            layout="list"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          label="Importer"
          icon="i-lucide-upload"
          :loading="importing"
          :disabled="!pdfFile || Boolean(pdfError)"
        />
      </form>
    </template>
  </UTabs>
</template>
