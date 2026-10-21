import { describe, expect, it } from 'vitest'
import { createAccount } from '../../engine/account'
import { reduce } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import type { ChronicleEntry, GameState, HeroId } from '../../engine/types'
import { groupedChronicle } from './speech'

describe('groupedChronicle', () => {
  it("reads an old save's doubled quarrel (either order) as one line", () => {
    let s: GameState = { ...createAccount(3), gold: TUNING.gacha.normalCostGold * 2 }
    for (let i = 0; i < 2; i++) s = reduce(s, { type: 'SUMMON' })
    const [a, b, c] = Object.keys(s.heroes) as HeroId[]
    const entries: ChronicleEntry[] = [
      { at: 1, kind: 'argument', heroIds: [a!, b!] },
      { at: 2, kind: 'argument', heroIds: [a!, c!] },
      { at: 3, kind: 'argument', heroIds: [b!, a!] },
    ]
    const lines = groupedChronicle(s, entries)
    expect(lines).toHaveLength(2)
    expect(new Set(lines).size).toBe(2)
  })
})
