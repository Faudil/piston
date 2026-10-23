import { CvContent, CvDesign, type CvTemplateId } from '@piston/shared'
import type { CvRenderInput } from '../src'

/**
 * A realistic CV (French accents, typographic characters, a Polish name
 * with Latin Extended letters), written in the v1 shape on purpose: it goes
 * through the v1 → v2 upgrade like a stored document.
 */
export const sampleRaw = {
  header: {
    fullName: 'Élodie Wiśniewska-Lefèvre',
    title: 'Chargée de communication événementielle',
    email: 'elodie@example.com',
    phone: '06 12 34 56 78',
    city: 'Besançon',
    links: [{ id: 'l1', label: 'LinkedIn', url: 'linkedin.com/in/elodie-lefevre' }],
  },
  summary:
    'Œuvre à « faire connaître » les événements culturels — 5 ans d’expérience en communication institutionnelle et digitale, de la stratégie à la relation presse.',
  experiences: [
    {
      id: 'e1',
      title: 'Chargée de communication',
      organization: 'Théâtre du Châtelet',
      location: 'Paris',
      start: '03/2021',
      end: "Aujourd'hui",
      bullets: [
        { id: 'b1', text: 'Pilotage de la communication de 12 spectacles par saison' },
        { id: 'b2', text: 'Hausse de la fréquentation de [X %] grâce aux réseaux sociaux' },
        { id: 'b3', text: 'Relations presse : 40 retombées nationales en 2023, dont Télérama' },
      ],
    },
    {
      id: 'e2',
      title: 'Assistante communication',
      organization: 'Mairie de Villeurbanne',
      location: 'Villeurbanne',
      start: '09/2018',
      end: '02/2021',
      bullets: [
        { id: 'b4', text: 'Organisation de la fête de quartier annuelle (3 000 visiteurs)' },
        { id: 'b5', text: 'Rédaction du magazine municipal et des communiqués' },
      ],
    },
  ],
  education: [
    {
      id: 'd1',
      degree: 'Master Communication des organisations',
      school: 'Université Lumière Lyon 2',
      location: 'Lyon',
      start: '2016',
      end: '2018',
      details: 'Mémoire sur la médiation culturelle numérique',
    },
  ],
  skills: [
    { id: 's1', name: 'Outils', items: ['Canva', 'Suite Adobe', 'WordPress', 'Meta Business'] },
    { id: 's2', name: 'Savoir-faire', items: ['Relations presse', 'Événementiel', 'Rédaction'] },
  ],
  languages: [
    { id: 'g1', name: 'Anglais', level: 'C1' },
    { id: 'g2', name: 'Polonais', level: 'Langue maternelle' },
  ],
  projects: [
    {
      id: 'p1',
      name: 'Podcast « Coulisses »',
      role: 'Créatrice',
      url: 'https://coulisses.example.com',
      start: '2022',
      end: '',
      bullets: [{ id: 'b6', text: 'Douze épisodes, 5 000 écoutes' }],
    },
  ],
  certifications: [{ id: 'c1', name: 'Google Ads', issuer: 'Google', date: '2022', url: '' }],
  interests: [{ id: 'i1', name: 'Théâtre amateur', details: 'Compagnie Les Tréteaux' }],
  sections: [],
}

export function sampleContent(): CvContent {
  return CvContent.parse(sampleRaw)
}

export function sampleInput(
  templateId: CvTemplateId,
  design: Record<string, unknown> = {},
  content: CvContent = sampleContent(),
): CvRenderInput {
  return { content, design: CvDesign.parse({ version: 2, ...design }), templateId }
}

/** A 2×2 red PNG, as the photo of the tests. */
export const PHOTO_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=='
