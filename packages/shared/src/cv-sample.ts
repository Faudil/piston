import { CvContent } from './cv'

/**
 * A fictional French CV, the gallery's thumbnails and the template tests
 * render it. Fixed ids: the same call gives the same document. Every piece
 * of content is invented (the person, the employers, the numbers).
 */
export function cvSampleContent(): CvContent {
  return CvContent.parse({
    version: 2,
    header: {
      fullName: 'Léa Marchand',
      title: 'Cheffe de projet digital',
      email: 'lea.marchand@exemple.fr',
      phone: '06 12 34 56 78',
      city: 'Lyon',
      links: [{ id: 'l1', label: '', url: 'linkedin.com/in/lea-marchand' }],
    },
    summary:
      'Cheffe de projet digital avec 6 ans d’expérience dans la refonte de sites et d’applications pour des PME et des collectivités. À l’aise entre équipes techniques, design et clients.',
    experiences: [
      {
        id: 'e1',
        title: 'Cheffe de projet digital',
        organization: 'Atelier Rhône Numérique',
        location: 'Lyon',
        start: '09/2021',
        end: "Aujourd'hui",
        bullets: [
          {
            id: 'b1',
            text: 'Pilotage de 8 projets web et mobile par an, de la phase de cadrage à la mise en ligne',
          },
          {
            id: 'b2',
            text: 'Mise en place d’une méthode agile commune à l’équipe de 12 personnes',
          },
        ],
      },
      {
        id: 'e2',
        title: 'Chargée de projet web',
        organization: 'Agence Lumen',
        location: 'Villeurbanne',
        start: '10/2018',
        end: '08/2021',
        bullets: [
          {
            id: 'b4',
            text: 'Gestion d’un portefeuille de 15 clients, du devis au suivi de la maintenance',
          },
          {
            id: 'b5',
            text: 'Rédaction des cahiers des charges et animation des ateliers utilisateurs',
          },
        ],
      },
    ],
    education: [
      {
        id: 'd1',
        degree: 'Master Management de projets numériques',
        school: 'Université Lumière Lyon 2',
        location: 'Lyon',
        start: '2016',
        end: '2018',
        details: 'Mention bien',
      },
      {
        id: 'd2',
        degree: 'Licence Information-communication',
        school: 'Université Grenoble Alpes',
        location: 'Grenoble',
        start: '2013',
        end: '2016',
        details: '',
      },
    ],
    skills: [
      {
        id: 's1',
        name: 'Gestion de projet',
        items: [
          { id: 's1a', name: 'Scrum et Kanban', level: 5 },
          { id: 's1b', name: 'Cahier des charges', level: 4 },
          { id: 's1c', name: 'Budget et planning', level: 4 },
        ],
      },
      {
        id: 's2',
        name: 'Outils',
        items: [
          { id: 's2a', name: 'Jira', level: 5 },
          { id: 's2b', name: 'Figma', level: 3 },
          { id: 's2c', name: 'Notion', level: 4 },
          { id: 's2d', name: 'Google Analytics', level: 3 },
        ],
      },
    ],
    languages: [
      { id: 'g1', name: 'Français', level: 'Langue maternelle', cefr: 'natif' },
      { id: 'g2', name: 'Anglais', level: 'Courant', cefr: 'C1' },
      { id: 'g3', name: 'Espagnol', level: 'Intermédiaire', cefr: 'B1' },
    ],
    projects: [
      {
        id: 'p1',
        name: 'Application de covoiturage associatif',
        role: 'Cheffe de projet bénévole',
        url: '',
        start: '2022',
        end: '2023',
        bullets: [
          {
            id: 'b7',
            text: 'Une application utilisée par 400 adhérents, développée avec 4 bénévoles',
          },
        ],
      },
    ],
  })
}
