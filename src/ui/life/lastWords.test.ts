import { describe, expect, it } from 'vitest'
import { reduce } from '../../engine/store'
import type { ChronicleEntry, FallenRecord, GameState, HeroId } from '../../engine/types'
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

  it('graves in one row (same floor, day and cause) keep the words the battle gave them', () => {
    const s = roster()
    const heroes = Object.values(s.heroes)
    const grave = (i: number, floor: number) =>
      ({ heroId: heroes[i]!.id, name: heroes[i]!.name, cause: 'battle', floor, day: 4, mourners: [], daysServed: 3 }) as unknown as FallenRecord
    // Five fell together on F12; a sixth fell alone on F13 the same day.
    const row = [0, 1, 2, 3, 4].map((i) => grave(i, 12))
    const lone = grave(5, 13)
    const st: GameState = { ...s, life: { ...s.life, memorial: [...row, lone] } }
    const together = lastWordsTogether(st, row)
    const remembered = row.map((g) => lastWords(st, g))
    expect(new Set(remembered).size).toBe(row.length)
    expect(remembered).toEqual(row.map((g) => together.get(g.heroId)))
    // A grave of its own says what that hero always says.
    expect(lastWords(st, lone)).toBe(lastWords(s, lone))
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
