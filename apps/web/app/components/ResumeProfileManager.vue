<script setup lang="ts">
import type { ResumeProfile } from '@piston/shared'

/**
 * Profile switcher of the CV page (one profile per specialty): one compact
 * menu in the page header to switch, create, rename, set as default or delete. The page owns the data; this component
 * only calls the API and tells the page what happened.
 */
const props = defineProps<{
  profiles: ResumeProfile[]
  selected: ResumeProfile | undefined
}>()
const emit = defineEmits<{
  select: [id: string]
  /** The profile list changed on the server: refetch it. */
  changed: []
  /** A profile was just created: the page refetches, selects it and opens the version form. */
  created: [profile: ResumeProfile]
  deleted: []
}>()

const toast = useToast()
const selectedId = computed(() => props.selected?.id)

const nameModal = reactive({ open: false, mode: 'create' as 'create' | 'rename', name: '' })
const deleteOpen = ref(false)
const busy = ref(false)

function openCreate() {
  Object.assign(nameModal, { open: true, mode: 'create', name: '' })
}

function openRename() {
  Object.assign(nameModal, { open: true, mode: 'rename', name: props.selected?.name ?? '' })
}

async function submitName() {
  busy.value = true
  try {
    if (nameModal.mode === 'create') {
      const created = await $fetch<ResumeProfile>('/api/profiles', {
        method: 'POST',
        body: { name: nameModal.name },
      })
      emit('created', created)
      toast.add({ title: `Profil « ${created.name} » créé`, icon: 'i-lucide-check' })
    } else {
      await $fetch(`/api/profiles/${selectedId.value}`, {
        method: 'PATCH',
        body: { name: nameModal.name },
      })
      emit('changed')
      toast.add({ title: 'Profil renommé', icon: 'i-lucide-check' })
    }
    nameModal.open = false
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busy.value = false
  }
}

async function makeDefault() {
  const profile = props.selected
  if (!profile) return
  try {
    await $fetch(`/api/profiles/${profile.id}`, { method: 'PATCH', body: { isDefault: true } })
    emit('changed')
    toast.add({
      title: 'Profil par défaut changé',
      description: `« ${profile.name} » sert désormais aux offres pour lesquelles tu n’en choisis pas d’autre.`,
      icon: 'i-lucide-check',
    })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

async function deleteSelected() {
  const profile = props.selected
  if (!profile) return
  busy.value = true
  try {
    await $fetch(`/api/profiles/${profile.id}`, { method: 'DELETE' })
    deleteOpen.value = false
    emit('deleted')
    toast.add({ title: `Profil « ${profile.name} » supprimé`, icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busy.value = false
  }
}

// Items that open a dialog wait for the menu to close (see utils/menus.ts).
const menu = computed(() => [
  [
    { type: 'label' as const, label: 'Profils de CV' },
    ...props.profiles.map((profile) => ({
      label: profile.isDefault ? `${profile.name} · par défaut` : profile.name,
      type: 'checkbox' as const,
      checked: profile.id === selectedId.value,
      onSelect: () => emit('select', profile.id),
    })),
    {
      label: 'Nouveau profil',
      icon: 'i-lucide-plus',
      onSelect: () => afterMenuCloses(openCreate),
    },
  ],
  ...(props.selected
    ? [
        [
          {
            label: `Renommer « ${props.selected.name} »`,
            icon: 'i-lucide-pencil',
            onSelect: () => afterMenuCloses(openRename),
          },
          ...(props.selected.isDefault
            ? []
            : [{ label: 'Définir par défaut', icon: 'i-lucide-star', onSelect: makeDefault }]),
          {
            label: 'Supprimer le profil',
            icon: 'i-lucide-trash-2',
            color: 'error' as const,
            onSelect: () => afterMenuCloses(() => (deleteOpen.value = true)),
          },
        ],
      ]
    : []),
])

const deleteDescription = computed(() => {
  const profile = props.selected
  if (!profile) return ''
  const versions =
    profile.versionsCount === 0
      ? "Il n'a aucune version."
      : profile.versionsCount === 1
        ? 'Sa version sera supprimée aussi.'
        : `Ses ${profile.versionsCount} versions seront supprimées aussi.`
  const fallback =
    profile.isDefault && props.profiles.length > 1
      ? ' Ton plus ancien autre profil deviendra le profil par défaut.'
      : ''
  return `${versions} Les offres qui l'utilisent passeront au profil par défaut.${fallback} Action définitive.`
})
</script>

<template>
  <div v-if="profiles.length">
    <UDropdownMenu
      :items="menu"
      :modal="false"
      :content="{ align: 'end' }"
      :ui="{ content: 'min-w-64' }"
    >
      <UButton
        :label="selected?.name ?? 'Profils'"
        icon="i-lucide-layers"
        trailing-icon="i-lucide-chevron-down"
        color="neutral"
        variant="outline"
        :aria-label="`Profil de CV : ${selected?.name}. Changer ou gérer les profils`"
        class="max-w-64"
        :ui="{ label: 'truncate' }"
      />
    </UDropdownMenu>

    <UModal
      v-model:open="nameModal.open"
      :title="nameModal.mode === 'create' ? 'Nouveau profil de CV' : 'Renommer le profil'"
      :description="
        nameModal.mode === 'create'
          ? 'Un profil par spécialité, par exemple « Communication » ou « Marketing digital ».'
          : undefined
      "
    >
      <template #body>
        <form class="space-y-4" @submit.prevent="submitName">
          <UFormField label="Nom du profil" required>
            <UInput
              v-model="nameModal.name"
              class="w-full"
              :maxlength="60"
              placeholder="Ex. : Marketing digital"
              autofocus
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              label="Annuler"
              color="neutral"
              variant="ghost"
              @click="nameModal.open = false"
            />
            <UButton
              type="submit"
              :label="nameModal.mode === 'create' ? 'Créer' : 'Renommer'"
              :loading="busy"
              :disabled="!nameModal.name.trim()"
            />
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      v-model:open="deleteOpen"
      :title="`Supprimer le profil « ${selected?.name} » ?`"
      :description="deleteDescription"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="ghost" @click="deleteOpen = false" />
          <UButton
            label="Supprimer"
            color="error"
            icon="i-lucide-trash-2"
            :loading="busy"
            @click="deleteSelected"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
