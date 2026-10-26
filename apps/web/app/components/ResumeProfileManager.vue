<script setup lang="ts">
import type { ResumeProfile } from '@piston/shared'

/**
 * Profile switcher of the CV page (one profile per specialty) with its
 * rename / default / delete actions. The page owns the data; this component
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

const profileTabs = computed(() =>
  props.profiles.map((profile) => ({
    label: profile.name,
    value: profile.id,
    badge: profile.isDefault ? { label: 'Par défaut', variant: 'subtle' as const } : undefined,
  })),
)
const profileItems = computed(() =>
  props.profiles.map((profile) => ({
    label: profile.isDefault ? `${profile.name} (par défaut)` : profile.name,
    value: profile.id,
  })),
)
/** Tabs read well for a few short names; beyond that (and on phones) a select is used. */
const useTabs = computed(() => props.profiles.length >= 2 && props.profiles.length <= 4)

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
const profileMenu = computed(() => [
  [
    { label: 'Renommer', icon: 'i-lucide-pencil', onSelect: () => afterMenuCloses(openRename) },
    ...(props.selected?.isDefault
      ? []
      : [{ label: 'Définir par défaut', icon: 'i-lucide-star', onSelect: makeDefault }]),
  ],
  [
    {
      label: 'Supprimer le profil',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => afterMenuCloses(() => (deleteOpen.value = true)),
    },
  ],
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
  <section aria-labelledby="cv-profiles" class="space-y-4">
    <AppSectionHeading
      id="cv-profiles"
      title="Profils de CV"
      icon="i-lucide-layers"
      :description="
        profiles.length
          ? 'Le profil par défaut sert aux offres pour lesquelles tu n\'en choisis pas d\'autre.'
          : 'Ton premier CV crée le profil « Principal ». Ajoute-en d\'autres si tu postules dans plusieurs domaines.'
      "
    >
      <UButton
        v-if="profiles.length"
        label="Nouveau profil"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        @click="openCreate"
      />
    </AppSectionHeading>

    <div v-if="profiles.length" class="flex items-end gap-2">
      <div class="min-w-0 flex-1">
        <UTabs
          v-if="useTabs"
          :model-value="selectedId"
          :items="profileTabs"
          :content="false"
          variant="pill"
          class="hidden w-full sm:flex"
          aria-label="Profil de CV affiché"
          @update:model-value="emit('select', String($event))"
        />
        <UFormField
          label="Profil affiché"
          :class="useTabs ? 'sm:hidden' : ''"
          :ui="{ label: profiles.length === 1 ? 'sr-only' : undefined }"
        >
          <USelect
            :model-value="selectedId"
            :items="profileItems"
            icon="i-lucide-layers"
            class="w-full"
            @update:model-value="emit('select', $event as string)"
          />
        </UFormField>
      </div>
      <UDropdownMenu :items="profileMenu" :modal="false" :content="{ align: 'end' }">
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="outline"
          :aria-label="`Actions du profil « ${selected?.name} »`"
        />
      </UDropdownMenu>
    </div>

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
  </section>
</template>
