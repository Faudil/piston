import type { Application, CvDocumentSummary, Generation, JobOffer, Resume } from '@piston/shared'

/**
 * The dashboard's single « next step » card, from what the user has done so
 * far. Pure derivation from the data the page already fetched.
 */
export function useDashboardNextStep(source: {
  currentResume: Ref<Resume | undefined>
  lastReview: Ref<Generation<'resume_review'> | undefined>
  offers: Ref<JobOffer[]>
  applications: Ref<Application[]>
  cvDocuments: Ref<CvDocumentSummary[]>
}) {
  const { currentResume, lastReview, offers, applications, cvDocuments } = source

  /** Days after which a sent application deserves a follow-up. */
  const FOLLOW_UP_AFTER_DAYS = 10

  const lastChange = (application: Application) =>
    application.statusHistory.at(-1)?.at ?? application.updatedAt

  /** Applications waiting to be sent, oldest first: the one to finish first. */
  const toSend = computed(() =>
    applications.value
      .filter((a) => a.status === 'to_send')
      .sort((a, b) => lastChange(a).localeCompare(lastChange(b))),
  )
  const toFollowUp = computed(() => {
    const limit = Date.now() - FOLLOW_UP_AFTER_DAYS * 24 * 3_600_000
    return applications.value.find(
      (a) => a.status === 'sent' && new Date(lastChange(a)).getTime() < limit,
    )
  })
  const where = (application: Application) =>
    application.offer.company
      ? `chez ${application.offer.company}`
      : `« ${application.offer.title} »`

  /**
   * The single most useful thing to do now, following the main flow: a resume,
   * its review, an offer, then the applications waiting on the user.
   */
  const nextStep = computed(() => {
    if (!currentResume.value)
      return {
        icon: 'i-lucide-file-user',
        title: 'Ajoute ton CV pour commencer',
        text: "Piston s'appuie dessus pour tout le reste : critique, analyse d'offres, lettres.",
        action: { label: 'Ajouter mon CV', to: '/cv', icon: 'i-lucide-plus' },
      }
    if (!lastReview.value)
      return {
        icon: 'i-lucide-file-search',
        title: 'Fais critiquer ton CV',
        text: 'Quatre notes, tes points forts, ce qui coince et une réécriture ligne par ligne.',
        action: { label: 'Critiquer mon CV', to: '/cv', icon: 'i-lucide-sparkles' },
      }
    if (!offers.value.length)
      return {
        icon: 'i-lucide-target',
        title: 'Ajoute ta première offre',
        text: 'Claude la compare à ton CV, puis t’aide à écrire la lettre et à adapter ton CV.',
        action: { label: 'Nouvelle offre', to: '/offres?new=1', icon: 'i-lucide-plus' },
      }
    const first = toSend.value[0]
    if (first) {
      const others = toSend.value.length - 1
      return {
        icon: 'i-lucide-send',
        title: `Envoie ta candidature ${where(first)}`,
        text:
          'Termine la lettre, adapte ton CV à l’offre, puis passe la carte dans « Envoyée ».' +
          (others
            ? ` ${others} autre${others > 1 ? 's' : ''} candidature${others > 1 ? 's' : ''} à envoyer.`
            : ''),
        action: {
          label: 'Ouvrir l’offre',
          to: `/offres/${first.offer.id}`,
          icon: 'i-lucide-arrow-right',
        },
      }
    }
    if (toFollowUp.value)
      return {
        icon: 'i-lucide-bell-ring',
        title: `Relance ta candidature ${where(toFollowUp.value)}`,
        text: `Envoyée il y a plus de ${FOLLOW_UP_AFTER_DAYS} jours, sans nouvelle. Une relance courte et polie suffit.`,
        action: {
          label: 'Voir la candidature',
          to: `/candidatures?candidature=${toFollowUp.value.id}`,
          icon: 'i-lucide-arrow-right',
        },
      }
    if (!cvDocuments.value.length)
      return {
        icon: 'i-lucide-file-pen-line',
        title: 'Mets ton CV en page avec Piston',
        text: 'Des modèles lisibles par les logiciels de recrutement, et une copie adaptée à chaque offre en un clic.',
        action: { label: 'Créer mon CV', to: '/cv#cv-builder', icon: 'i-lucide-plus' },
      }
    return {
      icon: 'i-lucide-target',
      title: 'Une autre offre te tente ?',
      text: 'Ajoute-la : Claude la compare à ton CV et prépare ta lettre de motivation.',
      action: { label: 'Nouvelle offre', to: '/offres?new=1', icon: 'i-lucide-plus' },
    }
  })

  return { nextStep }
}
