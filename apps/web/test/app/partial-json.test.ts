import { describe, expect, it } from 'vitest'
import { parsePartialJson } from '../../app/utils/partial-json'

describe('parsePartialJson', () => {
  it('parses complete JSON', () => {
    expect(parsePartialJson('{"a":1,"b":[1,2]}')).toEqual({ a: 1, b: [1, 2] })
  })

  it('closes open strings, arrays and objects', () => {
    expect(parsePartialJson('{"summary":"Bon prof')).toEqual({ summary: 'Bon prof' })
    expect(parsePartialJson('{"list":[{"q":"Pourquoi')).toEqual({ list: [{ q: 'Pourquoi' }] })
  })

  it('drops a dangling key or comma', () => {
    expect(parsePartialJson('{"a":1,')).toEqual({ a: 1 })
    expect(parsePartialJson('{"a":1,"b')).toEqual({ a: 1 })
    expect(parsePartialJson('{"a":1,"b":')).toEqual({ a: 1 })
  })

  it('handles escaped quotes inside strings', () => {
    expect(parsePartialJson('{"a":"il dit \\"ok')).toEqual({ a: 'il dit "ok' })
  })

  it('returns undefined when nothing can be recovered', () => {
    expect(parsePartialJson('')).toBeUndefined()
  })
})
