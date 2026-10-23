import { describe, expect, it } from 'vitest'
import { CvDesign, createBlankCv } from '@piston/shared'
import { createCvHistory, restoreCvSnapshot, serializeCvSnapshot } from '../../app/utils/cv-history'

describe('createCvHistory', () => {
  it('coalesces edits made within the window into one undo step', () => {
    const history = createCvHistory('a')
    expect(history.record('ab', 1000)).toBe(true)
    history.record('abc', 1300)
    history.record('abcd', 1900) // 600 ms after the previous one: same burst
    expect(history.undo()).toBe('a')
    expect(history.canUndo()).toBe(false)
  })

  it('starts a new step after a pause', () => {
    const history = createCvHistory('a')
    history.record('ab', 1000)
    history.record('abc', 2000)
    expect(history.undo()).toBe('ab')
    expect(history.undo()).toBe('a')
    expect(history.undo()).toBeNull()
  })

  it('caps a burst so one long typing session stays undoable in parts', () => {
    const history = createCvHistory('', { maxBurstMs: 5000 })
    let text = ''
    for (let now = 0; now <= 12_000; now += 500) history.record((text += 'x'), now)
    let steps = 0
    while (history.undo() !== null) steps++
    expect(steps).toBe(3)
  })

  it('forces a new step on request', () => {
    const history = createCvHistory('a')
    history.record('ab', 1000)
    history.record('abc', 1100, { separate: true })
    expect(history.undo()).toBe('ab')
    history.redo()
    history.breakBurst()
    history.record('abcd', 1200)
    expect(history.undo()).toBe('abc')
  })

  it('ignores a snapshot equal to the current one', () => {
    const history = createCvHistory('a')
    expect(history.record('a', 10)).toBe(false)
    expect(history.canUndo()).toBe(false)
  })

  it('redoes what was undone until a new edit', () => {
    const history = createCvHistory('a')
    history.record('b', 1000)
    history.record('c', 5000)
    expect(history.undo()).toBe('b')
    expect(history.canRedo()).toBe(true)
    expect(history.redo()).toBe('c')
    expect(history.redo()).toBeNull()
    history.undo()
    history.record('d', 9000)
    expect(history.canRedo()).toBe(false)
  })

  it('does not merge an edit made right after an undo into the previous burst', () => {
    const history = createCvHistory('a')
    history.record('b', 1000)
    history.record('c', 5000)
    history.undo()
    history.record('d', 5100)
    expect(history.undo()).toBe('b')
  })

  it('keeps at most `limit` steps', () => {
    const history = createCvHistory('0', { limit: 3 })
    for (let index = 1; index <= 6; index++) history.record(String(index), index * 10_000)
    const seen: string[] = []
    for (let undone = history.undo(); undone !== null; undone = history.undo()) seen.push(undone)
    expect(seen).toEqual(['5', '4', '3'])
  })

  it('setPresent replaces the current state without making a step', () => {
    const history = createCvHistory('a')
    history.record('b', 1000)
    history.undo()
    history.setPresent('a2')
    expect(history.canUndo()).toBe(false)
    expect(history.redo()).toBe('b')
  })
})

describe('CV snapshots', () => {
  const state = (name: string, assetId: string | null) => {
    const content = createBlankCv(name)
    if (assetId) {
      content.header.photo = {
        assetId,
        shape: 'round',
        size: 'm',
        position: 'left',
        visible: true,
      }
    }
    return { templateId: 'moderne' as const, design: createCvDesign(), content }
  }

  it('leaves the photo out, so uploading one is not an undo step', () => {
    const withPhoto = serializeCvSnapshot(state('Camille', '3f2b8f5e-8a52-4f4e-9d1e-0a8f8f1f6a11'))
    const without = serializeCvSnapshot(state('Camille', null))
    expect(withPhoto).toBe(without)
  })

  it('restores a snapshot with the current photo', () => {
    const snapshot = serializeCvSnapshot(state('Avant', null))
    const current = state('Après', '3f2b8f5e-8a52-4f4e-9d1e-0a8f8f1f6a11')
    const restored = restoreCvSnapshot(snapshot, current)
    expect(restored.content.header.fullName).toBe('Avant')
    expect(restored.content.header.photo?.assetId).toBe(current.content.header.photo?.assetId)
    expect(restoreCvSnapshot(snapshot, state('Après', null)).content.header.photo).toBeNull()
  })
})

function createCvDesign() {
  return CvDesign.parse({})
}
