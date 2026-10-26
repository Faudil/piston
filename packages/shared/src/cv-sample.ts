import { CvContent } from './cv'
import { applyTemplateSectionOrder, type CvTemplateMeta } from './cv-templates'

/** Asset id of the sample CV's photo (see `cvSampleAssets`). */
export const CV_SAMPLE_PHOTO_ASSET_ID = '00000000-0000-4000-8000-0000000000a1'

/**
 * The sample CV's photo: a drawn, neutral silhouette on a grey-blue
 * background (200 × 200 PNG, generated, nobody's face), so the gallery's
 * thumbnails show where each template puts a photo.
 */
export const CV_SAMPLE_PHOTO_DATA_URL =
  'data:image/png;base64,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'

/** The assets the sample CV refers to, in the renderer's `CvAssets` shape. */
export function cvSampleAssets(): { images: Record<string, string> } {
  return { images: { [CV_SAMPLE_PHOTO_ASSET_ID]: CV_SAMPLE_PHOTO_DATA_URL } }
}

/**
 * The sample CV as a template's thumbnail shows it: in the template's
 * recommended section order, without the photo for plain templates
 * (`photo: 'none'`).
 */
export function cvTemplateSampleContent(template: CvTemplateMeta): CvContent {
  const content = applyTemplateSectionOrder(cvSampleContent(), template)
  if (template.photo === 'none') content.header.photo = null
  return content
}

/**
 * A fictional French CV, the gallery's thumbnails and the template tests
 * render it. Fixed ids: the same call gives the same document. Every piece
 * of content is invented (the person, the employers, the numbers); the
 * photo is a drawn silhouette (`cvSampleAssets`). Skills have levels and
 * languages CEFR levels, so gauges show.
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
      photo: {
        assetId: CV_SAMPLE_PHOTO_ASSET_ID,
        shape: 'round',
        size: 'm',
        position: 'left',
        visible: true,
      },
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
