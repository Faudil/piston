/**
 * Documents exactly as the v1 CV builder stored them (`cv_documents.content`
 * and `.design` jsonb), for the upgrade tests. Do not "fix" them: their
 * point is to be v1.
 */

/** A filled v1 document: skills as strings, languages without CEFR, the eight v1 sections. */
export const v1Content = {
  header: {
    fullName: 'Élodie Lefèvre',
    title: 'Chargée de communication événementielle',
    email: 'elodie@example.com',
    phone: '06 12 34 56 78',
    city: 'Besançon',
    links: [{ id: 'l1', label: 'LinkedIn', url: 'linkedin.com/in/elodie-lefevre' }],
  },
  summary: 'Cinq ans de communication culturelle.',
  experiences: [
    {
      id: 'e1',
      title: 'Chargée de communication',
      organization: 'Théâtre du Châtelet',
      location: 'Paris',
      start: '03/2021',
      end: "Aujourd'hui",
      bullets: [{ id: 'b1', text: 'Pilotage de la communication de 12 spectacles par saison' }],
    },
  ],
  education: [
    {
      id: 'd1',
      degree: 'Master Communication',
      school: 'Université de Franche-Comté',
      location: 'Besançon',
      start: '2016',
      end: '2018',
      details: '',
    },
  ],
  skills: [
    { id: 's1', name: 'Outils', items: ['Canva', 'Suite Adobe', 'WordPress'] },
    { id: 's2', name: 'Communication', items: [] },
  ],
  languages: [
    { id: 'g1', name: 'Anglais', level: 'C1' },
    { id: 'g2', name: 'Espagnol', level: 'Courant' },
    { id: 'g3', name: 'Français', level: 'Langue maternelle' },
  ],
  projects: [],
  certifications: [],
  interests: [{ id: 'i1', name: 'Théâtre', details: '' }],
  sections: [
    { key: 'summary', title: '', visible: true },
    { key: 'experiences', title: '', visible: true },
    { key: 'skills', title: 'Savoir-faire', visible: true },
    { key: 'education', title: '', visible: true },
    { key: 'languages', title: '', visible: true },
    { key: 'projects', title: '', visible: false },
    { key: 'certifications', title: '', visible: false },
    { key: 'interests', title: '', visible: true },
  ],
}

/** v1 designs: the default one, and one with every option changed. */
export const v1DefaultDesign = {
  accentColor: '#c8410b',
  font: 'inter',
  density: 'normal',
  language: 'fr',
}

export const v1CustomDesign = {
  accentColor: '#1d4ed8',
  font: 'source-serif',
  density: 'compact',
  language: 'en',
}
