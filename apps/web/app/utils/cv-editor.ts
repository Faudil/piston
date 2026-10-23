import type { CvContentTarget } from '@piston/cv-render'
import {
  cvItemLabel,
  cvListSectionKeys,
  type CvContent,
  type CvItem,
  type CvListSectionKey,
  type CvSectionConfig,
  type CvSkillGroup,
} from '@piston/shared'

/** Singular and plural nouns of the items of each list section, for summary lines. */
const NOUNS: Record<CvListSectionKey, [string, string]> = {
  experiences: ['expérience', 'expériences'],
  education: ['formation', 'formations'],
  skills: ['groupe de compétences', 'groupes de compétences'],
  languages: ['langue', 'langues'],
  projects: ['projet', 'projets'],
  certifications: ['certification', 'certifications'],
  interests: ['centre d’intérêt', 'centres d’intérêt'],
  volunteering: ['engagement', 'engagements'],
  awards: ['distinction', 'distinctions'],
  publications: ['publication', 'publications'],
  references: ['référence', 'références'],
  extras: ['information', 'informations'],
}

/** What an empty section invites to do, shown in its body. */
export const cvSectionEmptyHints: Record<CvListSectionKey | 'summary' | 'custom', string> = {
  summary: 'Trois ou quatre lignes : qui tu es, ce que tu sais faire, ce que tu cherches.',
  experiences:
    'Commence par ton poste le plus récent : intitulé, entreprise, dates, puis tes réalisations.',
  education: 'Ajoute ton diplôme le plus haut, puis les formations utiles pour le poste.',
  skills: 'Regroupe tes compétences par thème (« Outils », « Techniques »…).',
  languages: 'Indique chaque langue avec son niveau CECRL (A1 à C2) ou « langue maternelle ».',
  projects: 'Un projet personnel ou associatif qui montre ce que tu sais faire.',
  certifications: 'Certifications, formations courtes, permis professionnels…',
  interests: 'Deux ou trois centres d’intérêt qui disent quelque chose de toi.',
  volunteering: 'Bénévolat, engagement associatif : rôle, structure, dates et ce que tu y as fait.',
  awards: 'Prix, bourses, distinctions, avec l’organisme et la date.',
  publications: 'Articles, ouvrages, communications : titre, revue ou média, date.',
  references:
    'Ajoute des personnes prêtes à parler de toi, ou indique « Disponibles sur demande ».',
  extras: 'Permis B, mobilité, disponibilité… une information par ligne.',
  custom: 'Ajoute des éléments avec un titre, un sous-titre, une date et un texte.',
}

function count(section: CvListSectionKey, n: number): string {
  const [one, many] = NOUNS[section]
  return `${n} ${n > 1 ? many : one}`
}

function excerpt(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

/** Whether a section holds anything (a summary text, at least one item). */
export function cvSectionHasContent(content: CvContent, section: CvSectionConfig): boolean {
  if (section.key === 'custom') {
    return Boolean(content.custom.find((entry) => entry.id === section.customId)?.items.length)
  }
  if (section.key === 'summary') return content.summary.trim() !== ''
  if (section.key === 'references' && content.referencesAvailableOnRequest) return true
  return (content[section.key] as unknown[]).length > 0
}

/**
 * The one-line summary of a collapsed section card: how many items and
 * what they are, or the start of the summary text.
 */
export function cvSectionSummary(content: CvContent, section: CvSectionConfig): string {
  if (section.key === 'custom') {
    const items = content.custom.find((entry) => entry.id === section.customId)?.items ?? []
    if (!items.length) return 'Section vide'
    const titles = items.map((item) => item.title.trim()).filter(Boolean)
    return titles.length ? `${items.length} · ${excerpt(titles.join(', '), 60)}` : `${items.length}`
  }
  if (section.key === 'summary') {
    return content.summary.trim() ? excerpt(content.summary, 80) : 'Pas encore d’accroche'
  }
  const items = content[section.key] as CvItem[]
  if (section.key === 'references' && content.referencesAvailableOnRequest) {
    return 'Disponibles sur demande'
  }
  if (!items.length) return 'Vide'
  const key: CvListSectionKey = section.key
  const labels =
    key === 'skills'
      ? (items as CvSkillGroup[]).flatMap((group) => group.items.map((skill) => skill.name))
      : items.map((item) => cvItemLabel(key, item)).filter((label) => label !== 'Sans titre')
  const head =
    key === 'skills'
      ? `${(items as CvSkillGroup[]).reduce((n, g) => n + g.items.length, 0)} compétences`
      : count(key, items.length)
  return labels.length ? `${head} · ${excerpt(labels.join(', '), 60)}` : head
}

/** Where a piece of content lives in the editor: its section (a `cvSectionRef`, or `header`) and item. */
export interface CvContentLocation {
  section: string
  itemId?: string
}

/**
 * The section and item that own a clicked piece of the preview, so the
 * editor can open them before focusing the field. Null when the content no
 * longer exists (the preview is a few hundred milliseconds behind).
 */
export function cvLocateContent(
  content: CvContent,
  target: CvContentTarget,
): CvContentLocation | null {
  switch (target.kind) {
    case 'header':
    case 'link':
      return { section: 'header' }
    case 'summary':
      return { section: 'summary' }
    case 'section':
      return { section: target.ref }
    case 'item':
    case 'bullet':
    case 'skill': {
      for (const key of cvListSectionKeys) {
        for (const item of content[key] as CvItem[]) {
          const record = item as unknown as {
            id: string
            bullets?: Array<{ id: string }>
            items?: Array<{ id: string }>
          }
          const owns =
            target.kind === 'item'
              ? record.id === target.itemId
              : target.kind === 'bullet'
                ? record.bullets?.some((bullet) => bullet.id === target.bulletId)
                : record.items?.some((skill) => skill.id === target.skillId)
          if (owns) return { section: key, itemId: record.id }
        }
      }
      for (const section of content.custom) {
        const found = section.items.find(
          (item) => target.kind === 'item' && item.id === target.itemId,
        )
        if (found) return { section: `custom:${section.id}`, itemId: found.id }
      }
      return null
    }
  }
}
