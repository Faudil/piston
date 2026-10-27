import { onboardingHints, type OnboardingHint } from '@piston/shared'

export const onboardingAll: readonly OnboardingHint[] = onboardingHints

/** One-time tips at the top of the main pages: how to use the page, in one sentence. */
export const pageTips: Record<
  Exclude<OnboardingHint, 'welcome'>,
  { title: string; text: string }
> = {
  cv: {
    title: 'Ton CV, la base de tout',
    text: 'Un PDF ou un simple copier-coller suffit. Lance ensuite la critique : Claude note ton CV, explique ce qui coince et propose des réécritures. Tu peux créer un profil par type de poste visé.',
  },
  offres: {
    title: 'Une annonce t’intéresse ? Ajoute-la ici',
    text: 'Colle son texte ou son lien. Claude te dit si elle te correspond et pourquoi, puis t’aide à écrire la lettre et à adapter ton CV, depuis la page de l’offre.',
  },
  candidatures: {
    title: 'Ton tableau de suivi',
    text: 'Chaque offre où tu postules devient une carte. Fais-la glisser de colonne en colonne au fil de tes démarches : Piston te rappelle quand il est temps de relancer.',
  },
}
