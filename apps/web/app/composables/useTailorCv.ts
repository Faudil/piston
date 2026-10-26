import type { CvDocument, CvDocumentSummary, JobOffer } from '@piston/shared'

/**
 * « Adapter mon CV à cette offre »: copies the latest CV document of the
 * offer's profile into a copy dedicated to the offer, then opens it in the
 * editor with `?adapter=<offerId>`, which starts Claude's tailoring proposal
 * (the same flow as the editor's « Dans une copie dédiée »). Without any CV
 * built in Piston for that profile, it leads to « Créer mon CV » first.
 */
export function useTailorCv() {
  const toast = useToast()
  const pending = ref(false)

  /** `defaultProfileId` stands for the offer's profile when the offer has none. */
  async function tailor(
    offer: Pick<JobOffer, 'id' | 'profileId'>,
    documents: CvDocumentSummary[],
    defaultProfileId: string | undefined,
  ) {
    const profileId = offer.profileId ?? defaultProfileId
    const ofProfile = documents
      .filter((document) => document.profileId === profileId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    // Prefer a general CV over one already tailored to another offer.
    const source = ofProfile.find((document) => !document.offer) ?? ofProfile[0]
    if (!source) {
      toast.add({
        title: 'Crée d’abord ton CV dans Piston',
        description: 'Claude pourra ensuite en faire une copie adaptée à cette offre.',
        icon: 'i-lucide-info',
      })
      await navigateTo({ path: '/cv/nouveau', query: profileId ? { profil: profileId } : {} })
      return
    }
    pending.value = true
    try {
      const copy = await $fetch<CvDocument>(`/api/cv-documents/${source.id}/duplicate`, {
        method: 'POST',
        body: { offerId: offer.id },
      })
      await navigateTo({ path: `/cv/editeur/${copy.id}`, query: { adapter: offer.id } })
    } catch (err) {
      toast.add({ title: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
    } finally {
      pending.value = false
    }
  }

  return { tailor, pending }
}
