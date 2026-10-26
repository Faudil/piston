import type { CvAssets } from '@piston/cv-render'
import type { CvAsset, CvContent, CvPhoto } from '@piston/shared'
import { blobToDataUrl } from '~/utils/cv-photo'

/**
 * The header photo of a CV document: uploads (a cropped JPEG made in the
 * browser), removal, and the data URL the live preview needs in its
 * `assets` (the server loads the bytes itself for exports).
 *
 * Upload and removal are immediate server actions; they also set
 * `content.header.photo`, which autosave then stores like any other change.
 */
export function useCvPhoto(documentId: string, content: () => CvContent) {
  const toast = useToast()
  const dataUrl = ref<string | null>(null)
  const busy = ref(false)

  const photo = computed(() => content().header.photo)

  /** What the renderer needs to draw the photo. */
  const assets = computed<CvAssets>(() => {
    const current = photo.value
    return current && dataUrl.value ? { images: { [current.assetId]: dataUrl.value } } : {}
  })

  // An existing photo: fetch it once for the preview.
  onMounted(async () => {
    if (!photo.value) return
    try {
      const blob = await $fetch<Blob>(`/api/cv-documents/${documentId}/photo`, {
        responseType: 'blob',
      })
      dataUrl.value = await blobToDataUrl(blob)
    } catch {
      // A missing file is shown as « Photo introuvable » by the photo editor.
      dataUrl.value = null
    }
  })

  /** Uploads the cropped photo and makes it the document's photo (shape, size and position are kept). */
  async function upload(blob: Blob): Promise<boolean> {
    busy.value = true
    try {
      const form = new FormData()
      form.append('file', blob, 'photo.jpg')
      const asset = await $fetch<CvAsset>(`/api/cv-documents/${documentId}/photo`, {
        method: 'POST',
        body: form,
      })
      dataUrl.value = await blobToDataUrl(blob)
      const previous = photo.value
      const next: CvPhoto = {
        shape: previous?.shape ?? 'round',
        size: previous?.size ?? 'm',
        position: previous?.position ?? 'left',
        visible: true,
        assetId: asset.id,
      }
      content().header.photo = next
      return true
    } catch (err) {
      toast.add({
        title: apiErrorMessage(err, 'Impossible d’envoyer la photo.'),
        icon: 'i-lucide-circle-alert',
        color: 'error',
      })
      return false
    } finally {
      busy.value = false
    }
  }

  async function remove(): Promise<void> {
    busy.value = true
    try {
      await $fetch(`/api/cv-documents/${documentId}/photo`, { method: 'DELETE' })
      content().header.photo = null
      dataUrl.value = null
    } catch (err) {
      toast.add({
        title: apiErrorMessage(err, 'Impossible de supprimer la photo.'),
        icon: 'i-lucide-circle-alert',
        color: 'error',
      })
    } finally {
      busy.value = false
    }
  }

  return { photo, dataUrl, assets, busy, upload, remove }
}

export type CvPhotoController = ReturnType<typeof useCvPhoto>
