import { describe, expect, it } from 'vitest'
import type { Generation } from '@piston/shared'
import {
  changedTemplateLabel,
  countWords,
  joinLetter,
  letterFilename,
  letterVersionLabel,
  splitLetter,
} from '../../app/utils/letters'
import { formatRelative } from '../../app/utils/dates'

const body1 = 'Votre annonce pour un poste de développeuse front m’a tout de suite parlé.'
const body2 = 'Chez Globex, j’ai migré une application de 40 écrans vers Vue 3 en six mois.'
const closing =
  'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.'

describe('splitLetter', () => {
  it('separates the salutation, the body and the closing lines', () => {
    expect(splitLetter(['Madame, Monsieur,', body1, body2, closing, 'Camille Martin'])).toEqual({
      header: ['Madame, Monsieur,'],
      body: [body1, body2],
      footer: [closing, 'Camille Martin'],
    })
  })

  it('reads the subject and greeting of an e-mail', () => {
    const parts = splitLetter([
      'Objet : Candidature au poste de développeuse front',
      'Bonjour,',
      body1,
      'Bien cordialement,',
      'Camille Martin',
    ])
    expect(parts.header).toEqual(['Objet : Candidature au poste de développeuse front', 'Bonjour,'])
    expect(parts.body).toEqual([body1])
    expect(parts.footer).toEqual(['Bien cordialement,', 'Camille Martin'])
  })

  it('splits a salutation or a signature glued to a paragraph by a single line break', () => {
    const parts = splitLetter([`Madame, Monsieur,\n${body1}`, `${body2}\n${closing}\nCamille`])
    expect(parts).toEqual({
      header: ['Madame, Monsieur,'],
      body: [body1, body2],
      footer: [closing, 'Camille'],
    })
    // Stored again, each line becomes its own paragraph.
    expect(joinLetter(parts)).toEqual(['Madame, Monsieur,', body1, body2, closing, 'Camille'])
  })

  it('keeps in the body a closing paragraph that also says something', () => {
    const last = `Je serais ravie d’en parler lors d’un entretien. ${closing}`
    const parts = splitLetter(['Madame, Monsieur,', body1, last])
    expect(parts.body).toEqual([body1, last])
    expect(parts.footer).toEqual([])
  })

  it('leaves a letter without salutation or signature untouched', () => {
    expect(splitLetter([body1, body2])).toEqual({ header: [], body: [body1, body2], footer: [] })
  })

  it('never returns an empty body', () => {
    expect(splitLetter(['Bonjour,', 'Camille'])).toEqual({
      header: [],
      body: ['Bonjour,', 'Camille'],
      footer: [],
    })
  })

  it('round-trips a well-formed letter', () => {
    const letter = ['Madame, Monsieur,', body1, body2, closing, 'Camille Martin']
    expect(joinLetter(splitLetter(letter))).toEqual(letter)
  })
})

describe('countWords', () => {
  it('counts the words of the given paragraphs', () => {
    expect(countWords(['Un deux  trois', ' quatre\ncinq '])).toBe(5)
    expect(countWords([])).toBe(0)
  })
})

type Version = Pick<Generation<'cover_letter'>, 'inputRefs' | 'output'>
const version = (
  inputRefs: Version['inputRefs'],
  paragraphs = ['Madame, Monsieur,', body1, body2],
) => ({ inputRefs, output: { paragraphs } }) as Version

describe('letterVersionLabel', () => {
  it('names a new letter, corrections and a rewritten body paragraph', () => {
    expect(letterVersionLabel(version({}))).toBe('Nouvelle lettre')
    expect(
      letterVersionLabel(version({ revisionInstructions: '  Plus court\net plus direct ' })),
    ).toBe('Corrections : Plus court et plus direct')
    // Index 2 of the stored paragraphs is the second body paragraph.
    expect(letterVersionLabel(version({ paragraphIndex: 2 }))).toBe('Paragraphe 2 réécrit')
    expect(letterVersionLabel(version({ paragraphIndex: 0 }, [body1, body2]))).toBe(
      'Paragraphe 1 réécrit',
    )
  })

  it('shortens long corrections', () => {
    const label = letterVersionLabel(version({ revisionInstructions: 'a'.repeat(200) }))
    expect(label).toBe(`Corrections : ${'a'.repeat(80)}…`)
  })
})

describe('changedTemplateLabel', () => {
  it('names the template of the first version and of a change only', () => {
    const classic = version({ template: 'classique' })
    const punchy = version({ template: 'percutante' })
    expect(changedTemplateLabel(classic, undefined)).toBe('Classique')
    expect(changedTemplateLabel(classic, classic)).toBeNull()
    expect(changedTemplateLabel(punchy, classic)).not.toBeNull()
    // Letters older than templates used the classic structure.
    expect(changedTemplateLabel(version({}), classic)).toBeNull()
  })
})

describe('letterFilename', () => {
  it('builds a file name from the company', () => {
    expect(letterFilename('Société Générale')).toBe('lettre-societe-generale')
    expect(letterFilename('')).toBe('lettre-motivation')
  })
})

describe('formatRelative', () => {
  const now = new Date(2026, 9, 26, 15, 0)
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()

  it('says how long ago a recent event happened', () => {
    expect(formatRelative(ago(0), now)).toBe("à l'instant")
    expect(formatRelative(ago(5), now)).toBe('il y a 5 minutes')
    expect(formatRelative(ago(120), now)).toBe('il y a 2 heures')
    expect(formatRelative(new Date(2026, 9, 26, 8, 5).toISOString(), now)).toBe(
      "aujourd'hui à 08:05",
    )
    expect(formatRelative(new Date(2026, 9, 25, 14, 32).toISOString(), now)).toBe('hier à 14:32')
  })

  it('falls back to the date for older events', () => {
    expect(formatRelative(new Date(2026, 8, 1, 9, 0).toISOString(), now)).toMatch(/2026/)
  })
})
