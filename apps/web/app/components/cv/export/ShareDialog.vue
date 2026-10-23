<script setup lang="ts">
import type { CvShareLink } from '@piston/shared'

/**
 * Share links of a CV document: create one (expires in 7 or 30 days, or never),
 * copy it, see how many times it was opened, revoke it. Anyone with the link
 * sees the PDF, nothing else, and needs no account.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ documentId: string }>()

const toast = useToast()
const links = ref<CvShareLink[]>([])
const loading = ref(false)
const creating = ref(false)
const revoking = ref<string | null>(null)

const EXPIRIES = [
  { label: '7 jours', value: '7' },
  { label: '30 jours', value: '30' },
  { label: 'Sans limite', value: 'never' },
]
const expiry = ref('30')

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })

function urlOf(link: CvShareLink): string {
  return `${window.location.origin}/partage/${link.token}`
}

type LinkState = 'active' | 'expired' | 'revoked'
function stateOf(link: CvShareLink): LinkState {
  if (link.revokedAt) return 'revoked'
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return 'expired'
  return 'active'
}

const visible = computed(() => links.value.filter((link) => stateOf(link) === 'active'))
const inactive = computed(() => links.value.filter((link) => stateOf(link) !== 'active'))

async function load() {
  loading.value = true
  try {
    links.value = await $fetch<CvShareLink[]>(`/api/cv-documents/${props.documentId}/share`)
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    loading.value = false
  }
}
watch(open, (isOpen) => isOpen && load(), { immediate: true })

async function copy(link: CvShareLink) {
  try {
    await navigator.clipboard.writeText(urlOf(link))
    toast.add({ title: 'Lien copié.', icon: 'i-lucide-check' })
  } catch {
    toast.add({
      title: 'Copie impossible : sélectionne le lien et copie-le à la main.',
      color: 'error',
    })
  }
}

async function create() {
  creating.value = true
  try {
    const link = await $fetch<CvShareLink>(`/api/cv-documents/${props.documentId}/share`, {
      method: 'POST',
      body: { expiresInDays: expiry.value === 'never' ? null : Number(expiry.value) },
    })
    links.value = [link, ...links.value]
    await copy(link)
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    creating.value = false
  }
}

async function revoke(link: CvShareLink) {
  revoking.value = link.id
  try {
    const updated = await $fetch<CvShareLink>(
      `/api/cv-documents/${props.documentId}/share/${link.id}`,
      { method: 'DELETE' },
    )
    links.value = links.value.map((entry) => (entry.id === link.id ? updated : entry))
    toast.add({ title: 'Lien désactivé.', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    revoking.value = null
  }
}

const views = (count: number) => `${count} ${count > 1 ? 'consultations' : 'consultation'}`
</script>

<template>
  <UModal
    v-model:open="open"
    title="Partager ce CV"
    description="Toute personne qui a le lien voit le PDF de ce CV, sans compte. Tu peux désactiver un lien à tout moment."
  >
    <template #body>
      <div class="space-y-5">
        <form class="flex flex-wrap items-end gap-3" @submit.prevent="create">
          <UFormField label="Validité du lien" class="min-w-40 flex-1">
            <USelect v-model="expiry" :items="EXPIRIES" class="w-full" />
          </UFormField>
          <UButton type="submit" label="Créer un lien" icon="i-lucide-link" :loading="creating" />
        </form>

        <div v-if="loading && !links.length" class="space-y-2">
          <USkeleton v-for="i in 2" :key="i" class="h-16 w-full rounded-xl" />
        </div>
        <p v-else-if="!visible.length" class="text-sm text-muted">
          Aucun lien actif. Le lien montre le CV tel qu’il est enregistré, à chaque consultation.
        </p>
        <ul v-else class="space-y-2" aria-label="Liens de partage actifs">
          <li
            v-for="link in visible"
            :key="link.id"
            class="space-y-2 rounded-xl border border-default p-3"
          >
            <UInput
              :model-value="urlOf(link)"
              readonly
              class="w-full"
              aria-label="Adresse du lien de partage"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <div class="flex flex-wrap items-center gap-2">
              <p class="mr-auto text-xs text-muted">
                {{ views(link.viewCount) }} ·
                {{
                  link.expiresAt
                    ? `expire le ${dateFormat.format(new Date(link.expiresAt))}`
                    : 'sans date d’expiration'
                }}
              </p>
              <UButton
                label="Copier"
                icon="i-lucide-copy"
                size="sm"
                color="neutral"
                variant="outline"
                @click="copy(link)"
              />
              <UButton
                label="Désactiver"
                icon="i-lucide-link-2-off"
                size="sm"
                color="error"
                variant="outline"
                :loading="revoking === link.id"
                @click="revoke(link)"
              />
            </div>
          </li>
        </ul>

        <details v-if="inactive.length" class="text-sm text-muted">
          <summary class="cursor-pointer">
            Liens désactivés ou expirés ({{ inactive.length }})
          </summary>
          <ul class="mt-2 space-y-1">
            <li v-for="link in inactive" :key="link.id">
              {{ stateOf(link) === 'revoked' ? 'Désactivé' : 'Expiré' }} · créé le
              {{ dateFormat.format(new Date(link.createdAt)) }} · {{ views(link.viewCount) }}
            </li>
          </ul>
        </details>
      </div>
    </template>
  </UModal>
</template>
