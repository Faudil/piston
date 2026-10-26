import type { DropdownMenuItem } from '@nuxt/ui'
import type { CvDocument, Resume } from '@piston/shared'

type Editor = ReturnType<typeof useCvEditor>

/**
 * The CV editor page's document-level actions: save as the profile's current
 * version, duplicate, delete, rename, plain-text exports, and the state of the
 * dialogs they open. Every action saves pending edits first.
 */
export function useCvDocumentActions(id: string, document: CvDocument, editor: Editor) {
  const router = useRouter()
  const toast = useToast()
  const { state, status } = editor

  const busy = ref<'version' | 'duplicate' | 'delete' | null>(null)
  const historyOpen = ref(false)
  const renameOpen = ref(false)
  const deleteOpen = ref(false)
  const newTitle = ref('')

  async function download(path: string) {
    await editor.flush()
    window.location.href = path
  }

  async function saveAsVersion() {
    busy.value = 'version'
    try {
      await editor.flush()
      const resume = await $fetch<Resume>(`/api/cv-documents/${id}/save-version`, {
        method: 'POST',
      })
      toast.add({
        title: `« ${resume.title} » est la nouvelle version actuelle de ton profil.`,
        description: 'Critiques, analyses et lettres l’utilisent désormais.',
        icon: 'i-lucide-check',
        actions: [{ label: 'Voir sur la page CV', to: `/cv?profil=${resume.profileId}` }],
      })
    } catch (err) {
      toast.add({ title: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
    } finally {
      busy.value = null
    }
  }

  async function duplicate() {
    busy.value = 'duplicate'
    try {
      await editor.flush()
      const copy = await $fetch<CvDocument>(`/api/cv-documents/${id}/duplicate`, {
        method: 'POST',
        body: {},
      })
      await router.push(`/cv/editeur/${copy.id}`)
      toast.add({ title: 'Copie créée', icon: 'i-lucide-copy' })
    } catch (err) {
      toast.add({ title: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
    } finally {
      busy.value = null
    }
  }

  async function remove() {
    busy.value = 'delete'
    try {
      await $fetch(`/api/cv-documents/${id}`, { method: 'DELETE' })
      deleteOpen.value = false
      // Nothing left to save.
      status.value = 'saved'
      await router.push(`/cv?profil=${document.profileId}`)
      toast.add({ title: 'CV supprimé', icon: 'i-lucide-check' })
    } catch (err) {
      toast.add({ title: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
    } finally {
      busy.value = null
    }
  }

  function openRename(): void {
    newTitle.value = state.title
    renameOpen.value = true
  }

  function rename(): void {
    if (!newTitle.value.trim()) return
    state.title = newTitle.value.trim()
    renameOpen.value = false
  }

  const moreItems = computed<DropdownMenuItem[][]>(() => [
    [
      { label: 'Renommer', icon: 'i-lucide-pencil', onSelect: openRename },
      { label: 'Historique', icon: 'i-lucide-history', onSelect: () => (historyOpen.value = true) },
      { label: 'Dupliquer', icon: 'i-lucide-copy', onSelect: duplicate },
    ],
    [
      {
        label: 'Exporter en texte (.txt)',
        icon: 'i-lucide-file-text',
        onSelect: () => download(`/api/cv-documents/${id}/export?format=txt`),
      },
      {
        label: 'Exporter en Markdown (.md)',
        icon: 'i-lucide-file-code',
        onSelect: () => download(`/api/cv-documents/${id}/export?format=md`),
      },
      {
        label: 'Exporter en JSON',
        icon: 'i-lucide-braces',
        onSelect: () => download(`/api/cv-documents/${id}/export?format=json`),
      },
    ],
    [
      {
        label: 'Supprimer',
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        onSelect: () => (deleteOpen.value = true),
      },
    ],
  ])

  return {
    busy,
    historyOpen,
    renameOpen,
    deleteOpen,
    newTitle,
    saveAsVersion,
    remove,
    rename,
    moreItems,
  }
}
