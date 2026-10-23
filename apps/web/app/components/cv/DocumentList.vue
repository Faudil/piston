<script setup lang="ts">
import { cvTemplates, type CvDocument, type CvDocumentSummary, type Resume } from '@piston/shared'

/**
 * The CVs built in Piston for one resume profile, with the « Créer mon CV »
 * entry point: from the current version (Claude structures it), from a short
 * interview with Claude, or from a blank document.
 */
const props = defineProps<{
  profileId: string | undefined
  /** The profile's current version, offered as the source of an import. */
  currentResume: Resume | undefined
}>()

const toast = useToast()
const router = useRouter()

const createOpen = ref(false)
// Exposed before the first `await`, as Vue requires.
defineExpose({ openCreate: () => (createOpen.value = true) })

const { data: documents } = await useFetch<CvDocumentSummary[]>('/api/cv-documents', {
  query: computed(() => (props.profileId ? { profileId: props.profileId } : {})),
  default: () => [],
})

const creatingBlank = ref(false)

async function createBlank() {
  creatingBlank.value = true
  try {
    const document = await $fetch<CvDocument>('/api/cv-documents', {
      method: 'POST',
      body: { ...(props.profileId && { profileId: props.profileId }) },
    })
    await router.push(`/cv/editeur/${document.id}`)
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    creatingBlank.value = false
  }
}

function newDocumentLink(mode: 'import' | 'interview', resumeId?: string) {
  return {
    path: '/cv/nouveau',
    query: {
      mode,
      ...(props.profileId && { profil: props.profileId }),
      ...(resumeId && { version: resumeId }),
    },
  }
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })
</script>

<template>
  <div class="space-y-4">
    <ul v-if="documents.length" class="grid gap-3 sm:grid-cols-2">
      <li v-for="document in documents" :key="document.id">
        <NuxtLink
          :to="`/cv/editeur/${document.id}`"
          class="flex h-full items-start gap-3 rounded-2xl border border-default bg-default p-4 shadow-xs transition hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span
            class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
          >
            <UIcon name="i-lucide-file-pen-line" class="size-5" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium text-highlighted">{{ document.title }}</span>
            <span class="block truncate text-sm text-muted">
              {{ document.fullName || 'Sans nom' }} · {{ cvTemplates[document.templateId].label }} ·
              {{ dateFormat.format(new Date(document.updatedAt)) }}
            </span>
            <UBadge
              v-if="document.offer"
              :label="`Pour : ${document.offer.title}${document.offer.company ? ` — ${document.offer.company}` : ''}`"
              color="neutral"
              variant="subtle"
              size="sm"
              class="mt-2 max-w-full truncate"
            />
          </span>
          <UIcon name="i-lucide-chevron-right" class="mt-2 size-4 shrink-0 text-dimmed" />
        </NuxtLink>
      </li>
    </ul>

    <UEmpty
      v-else
      icon="i-lucide-file-pen-line"
      title="Crée un CV mis en page avec Piston"
      description="Un CV structuré, trois modèles lisibles par les logiciels de recrutement, et Claude pour proposer des améliorations que tu valides une par une."
      :actions="[
        { label: 'Créer mon CV', icon: 'i-lucide-plus', onClick: () => (createOpen = true) },
      ]"
    />

    <UModal
      v-model:open="createOpen"
      title="Créer mon CV"
      description="Claude ne t’invente jamais d’expérience : il structure ce que tu lui donnes."
    >
      <template #body>
        <ul class="space-y-2">
          <li v-if="currentResume">
            <NuxtLink
              :to="newDocumentLink('import', currentResume.id)"
              class="flex items-start gap-3 rounded-xl border border-default p-4 transition hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <UIcon name="i-lucide-file-input" class="mt-0.5 size-5 shrink-0 text-primary" />
              <span>
                <span class="block font-medium text-highlighted">Depuis mon CV actuel</span>
                <span class="block text-sm text-muted">
                  Claude range « {{ currentResume.title }} » dans les rubriques, sans le réécrire.
                </span>
              </span>
            </NuxtLink>
          </li>
          <li>
            <NuxtLink
              :to="newDocumentLink('interview')"
              class="flex items-start gap-3 rounded-xl border border-default p-4 transition hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <UIcon name="i-lucide-messages-square" class="mt-0.5 size-5 shrink-0 text-primary" />
              <span>
                <span class="block font-medium text-highlighted">De zéro, avec Claude</span>
                <span class="block text-sm text-muted">
                  Six questions sur ton parcours, puis un premier brouillon à compléter.
                </span>
              </span>
            </NuxtLink>
          </li>
          <li>
            <button
              type="button"
              class="flex w-full items-start gap-3 rounded-xl border border-default p-4 text-left transition hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
              :disabled="creatingBlank"
              @click="createBlank"
            >
              <UIcon
                :name="creatingBlank ? 'i-lucide-loader-circle' : 'i-lucide-file-plus'"
                class="mt-0.5 size-5 shrink-0 text-primary"
                :class="{ 'animate-spin': creatingBlank }"
              />
              <span>
                <span class="block font-medium text-highlighted">CV vide</span>
                <span class="block text-sm text-muted"
                  >Toutes les rubriques, à remplir toi-même.</span
                >
              </span>
            </button>
          </li>
        </ul>
      </template>
    </UModal>
  </div>
</template>
