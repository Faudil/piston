import { describe, expect, it } from 'vitest'
import { parseCvContentId } from '@piston/cv-render'
import {
  createBlankCv,
  createCvCustomSection,
  createCvItem,
  normalizeSections,
} from '@piston/shared'
import { cvLocateContent, cvSectionHasContent, cvSectionSummary } from '../../app/utils/cv-editor'
import { reorderSubset } from '../../app/utils/cv-order'
import {
  CV_PHOTO_MAX_SIDE,
  clampPhotoCrop,
  initialPhotoCrop,
  photoCropRect,
  photoOutputSide,
} from '../../app/utils/cv-photo'

describe('reorderSubset', () => {
  const key = (entry: string) => entry
  it('reorders the subset in its own slots and leaves the others where they are', () => {
    const full = ['a', 'H1', 'b', 'c', 'H2', 'd']
    expect(reorderSubset(full, ['a', 'b', 'c', 'd'], ['d', 'a', 'c', 'b'], key)).toEqual([
      'd',
      'H1',
      'a',
      'c',
      'H2',
      'b',
    ])
  })

  it('returns the list unchanged when the subsets do not match', () => {
    expect(reorderSubset(['a', 'b'], ['a'], ['z'], key)).toEqual(['a', 'b'])
    expect(reorderSubset(['a', 'b'], ['a', 'b'], ['a'], key)).toEqual(['a', 'b'])
  })
})

describe('photo crop geometry', () => {
  it('starts with the largest centered square', () => {
    const rect = photoCropRect(1200, 800, initialPhotoCrop(1200, 800))
    expect(rect).toEqual({ x: 200, y: 0, side: 800 })
  })

  it('zooms into a smaller square and keeps it inside the image', () => {
    const rect = photoCropRect(1000, 1000, { zoom: 2, cx: 20, cy: 990 })
    expect(rect).toEqual({ x: 0, y: 500, side: 500 })
    expect(clampPhotoCrop(1000, 1000, { zoom: 9, cx: 0, cy: 0 })).toEqual({
      zoom: 4,
      cx: 125,
      cy: 125,
    })
  })

  it('never upscales and never exceeds 800 px', () => {
    expect(photoOutputSide(300)).toBe(300)
    expect(photoOutputSide(3000)).toBe(CV_PHOTO_MAX_SIDE)
  })
})

describe('section summaries and content location', () => {
  it('summarizes sections for the collapsed card', () => {
    const content = createBlankCv('Camille')
    expect(cvSectionSummary(content, content.sections[0]!)).toBe('Pas encore d’accroche')
    content.experiences.push(
      createCvItem('experiences', { title: 'Chargée de com', organization: 'Agence X' }),
    )
    const experiences = content.sections.find((section) => section.key === 'experiences')!
    expect(cvSectionSummary(content, experiences)).toBe('1 expérience · Chargée de com · Agence X')
    expect(cvSectionHasContent(content, experiences)).toBe(true)
    const projects = content.sections.find((section) => section.key === 'projects')!
    expect(cvSectionSummary(content, projects)).toBe('Vide')
    expect(cvSectionHasContent(content, projects)).toBe(false)
  })

  it('finds the section and item that own a content id', () => {
    const content = createBlankCv('Camille')
    const experience = createCvItem('experiences', { bullets: ['Un résultat'] })
    content.experiences.push(experience)
    const custom = createCvCustomSection('Expositions', [{ title: 'Salon' }])
    content.custom.push(custom)
    content.sections = normalizeSections(content.sections, [custom.id])
    const locate = (id: string) => cvLocateContent(content, parseCvContentId(id)!)

    expect(locate('header.email')).toEqual({ section: 'header' })
    expect(locate('summary')).toEqual({ section: 'summary' })
    expect(locate(`bullet.${experience.bullets[0]!.id}`)).toEqual({
      section: 'experiences',
      itemId: experience.id,
    })
    expect(locate(`item.${custom.items[0]!.id}`)).toEqual({
      section: `custom:${custom.id}`,
      itemId: custom.items[0]!.id,
    })
    expect(locate('item.unknown')).toBeNull()
  })
})
