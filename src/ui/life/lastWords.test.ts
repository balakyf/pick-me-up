import { describe, expect, it } from 'vitest'
import { reduce } from '../../engine/store'
import type { ChronicleEntry, GameState, HeroId } from '../../engine/types'
import { groupedChronicle, lastWords, lastWordsTogether } from './speech'

function roster(): GameState {
  const s = reduce(null, { type: 'NEW_ACCOUNT', seed: 3131, now: 0 })
  return reduce(s, { type: 'SUMMON', pool: 'normal', count: 10 })
}

describe('last words and letters never repeat themselves', () => {
  it('heroes who fall together never share their last words, and the pick is stable', () => {
    const s = roster()
    const recs = Object.values(s.heroes)
      .slice(0, 5)
      .map((h) => ({ heroId: h.id, name: h.name }))
    const words = lastWordsTogether(s, recs)
    expect(new Set(words.values()).size).toBe(recs.length)
    // Deterministic, and independent of the order they are listed in.
    expect([...lastWordsTogether(s, [...recs].reverse())].sort()).toEqual([...words].sort())
    // Alone, a hero says what they always say.
    expect(lastWords(s, recs[0]!)).toBe(lastWords(s, recs[0]!))
  })

  it('the same news twice in a letter reads once, counted', () => {
    const s = roster()
    const [a, b] = Object.keys(s.heroes) as HeroId[]
    const fight = (at: number): ChronicleEntry => ({ at, kind: 'argument', heroIds: [a!, b!] }) as ChronicleEntry
    const lines = groupedChronicle(s, [fight(1), fight(2), fight(3)])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/\(×3\)$/)
  })
})
