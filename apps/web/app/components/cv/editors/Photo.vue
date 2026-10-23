<script setup lang="ts">
import type { cvPhotoPositions, cvPhotoShapes, cvPhotoSizes } from '@piston/shared'
import { loadPhotoSource, type PhotoSource } from '~/utils/cv-photo'

/**
 * The photo section of the header editor: pick a file, crop it to a square,
 * then shape, size, position and visibility. Photos are optional (and not
 * customary in every country): the CV looks complete without one.
 */
const props = defineProps<{ photo: CvPhotoController }>()
const toast = useToast()
/** The header photo (null without one), a ref of the controller so it can be edited in place. */
const current = props.photo.photo

const shapeItems = [
  { label: 'Ronde', value: 'round' },
  { label: 'Arrondie', value: 'rounded' },
  { label: 'Carrée', value: 'square' },
] satisfies Array<{ label: string; value: (typeof cvPhotoShapes)[number] }>
const sizeItems = [
  { label: 'Petite', value: 's' },
  { label: 'Moyenne', value: 'm' },
  { label: 'Grande', value: 'l' },
] satisfies Array<{ label: string; value: (typeof cvPhotoSizes)[number] }>
const positionItems = [
  { label: 'Gauche', value: 'left' },
  { label: 'Centre', value: 'center' },
  { label: 'Droite', value: 'right' },
] satisfies Array<{ label: string; value: (typeof cvPhotoPositions)[number] }>

const SHAPE_CLASS = { round: 'rounded-full', rounded: 'rounded-2xl', square: 'rounded-none' }
const SIZE_CLASS = { s: 'size-14', m: 'size-20', l: 'size-28' }

const input = useTemplateRef<HTMLInputElement>('input')
const source = shallowRef<PhotoSource | null>(null)
const cropping = ref(false)
/** Files this large are refused before decoding them (phones' originals are 3–10 MB). */
const MAX_PICKED_BYTES = 25 * 1024 * 1024

async function onPick(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.add({ title: 'Choisis une image JPEG ou PNG.', color: 'error' })
    return
  }
  if (file.size > MAX_PICKED_BYTES) {
    toast.add({ title: 'Cette image est trop volumineuse (25 Mo au maximum).', color: 'error' })
    return
  }
  try {
    source.value = await loadPhotoSource(file)
    cropping.value = true
  } catch (err) {
    toast.add({ title: (err as Error).message, color: 'error' })
  }
}

// Release the decoded image once the dialog is closed.
watch(cropping, (open) => {
  if (open) return
  const decoded = source.value
  source.value = null
  if (decoded && 'close' in decoded) decoded.close()
})

async function onCropped(blob: Blob) {
  await props.photo.upload(blob)
}
</script>

<template>
  <fieldset class="space-y-3" data-cv-id="header.photo">
    <legend class="text-sm font-medium text-highlighted">Photo</legend>
    <div class="flex flex-wrap items-center gap-4">
      <div
        class="grid shrink-0 place-items-center overflow-hidden border border-default bg-elevated text-muted"
        :class="[
          SIZE_CLASS[current?.size ?? 'm'],
          SHAPE_CLASS[current?.shape ?? 'round'],
          { 'opacity-40': current && !current.visible },
        ]"
      >
        <img
          v-if="current && photo.dataUrl.value"
          :src="photo.dataUrl.value"
          alt="Aperçu de ta photo"
          class="size-full object-cover"
        />
        <UIcon v-else name="i-lucide-user-round" class="size-1/2" aria-hidden="true" />
      </div>
      <div class="space-y-2">
        <div class="flex flex-wrap gap-2">
          <UButton
            :label="current ? 'Changer la photo' : 'Ajouter une photo'"
            icon="i-lucide-camera"
            color="neutral"
            variant="outline"
            size="sm"
            :loading="photo.busy.value"
            @click="input?.click()"
          />
          <UButton
            v-if="current"
            label="Supprimer"
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="photo.busy.value"
            @click="photo.remove()"
          />
        </div>
        <p class="text-xs text-muted">
          JPEG ou PNG. Tu pourras recadrer l’image avant de l’envoyer. Facultatif.
        </p>
        <p v-if="current && !photo.dataUrl.value" class="text-xs text-warning">
          Photo introuvable : ajoute-la de nouveau ou supprime-la.
        </p>
      </div>
      <input
        ref="input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        class="sr-only"
        tabindex="-1"
        aria-label="Choisir une photo"
        data-cv-photo-input
        @change="onPick"
      />
    </div>

    <div v-if="current" class="grid gap-3 sm:grid-cols-3">
      <UFormField label="Forme">
        <URadioGroup v-model="current.shape" :items="shapeItems" size="sm" />
      </UFormField>
      <UFormField label="Taille">
        <URadioGroup v-model="current.size" :items="sizeItems" size="sm" />
      </UFormField>
      <UFormField label="Position">
        <URadioGroup v-model="current.position" :items="positionItems" size="sm" />
      </UFormField>
      <USwitch
        v-model="current.visible"
        label="Afficher la photo sur le CV"
        class="sm:col-span-3"
      />
    </div>

    <CvEditorsPhotoCropper
      v-model:open="cropping"
      :source="source"
      :shape="current?.shape ?? 'round'"
      @confirm="onCropped"
      @error="toast.add({ title: $event, color: 'error' })"
    />
  </fieldset>
</template>
