import { CvContent } from '../src/cv'

/** A small CV with fixed ids, shared by the CV tests. */
export function sampleCv(): CvContent {
  return CvContent.parse({
    header: {
      fullName: 'Camille Durand',
      title: 'Chargée de communication',
      email: 'camille@example.com',
      phone: '06 12 34 56 78',
      city: 'Lyon',
      links: [{ id: 'l1', label: 'LinkedIn', url: 'https://linkedin.com/in/camille' }],
    },
    summary: 'Cinq ans de communication institutionnelle et digitale.',
    experiences: [
      {
        id: 'e1',
        title: 'Chargée de communication',
        organization: 'Agence Lumière',
        location: 'Lyon',
        start: '03/2021',
        end: "Aujourd'hui",
        bullets: [
          { id: 'b1', text: 'Gestion des réseaux sociaux de 12 clients' },
          { id: 'b2', text: 'Rédaction de communiqués de presse' },
        ],
      },
      {
        id: 'e2',
        title: 'Assistante communication',
        organization: 'Mairie de Villeurbanne',
        location: 'Villeurbanne',
        start: '09/2018',
        end: '02/2021',
        bullets: [{ id: 'b3', text: 'Organisation de la fête de quartier annuelle' }],
      },
    ],
    education: [
      {
        id: 'd1',
        degree: 'Master Communication',
        school: 'Université Lyon 2',
        location: 'Lyon',
        start: '2016',
        end: '2018',
        details: '',
      },
    ],
    skills: [{ id: 's1', name: 'Outils', items: ['Canva', 'WordPress'] }],
    languages: [{ id: 'g1', name: 'Anglais', level: 'C1' }],
    sections: [],
  })
}
