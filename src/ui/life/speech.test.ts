import { describe, it, expect } from 'vitest'
import { createAccount } from '../../engine/account'
import { reduce } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { stepLife, lifeOf } from '../../engine/life'
import type { ChronicleEntry, GameState, OwnedHero } from '../../engine/types'
import { chronicleLine, speak } from './speech'
import { memoryLine } from './lifeWindows'

function roster(seed: number, n = 5): GameState {
  let st: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) st = reduce(st, { type: 'SUMMON' })
  return stepLife(st, TUNING.life.slotMs)
}
const living = (s: GameState): OwnedHero[] => Object.values(s.heroes).filter((h) => h.alive)

describe('hearts in the dialogue', () => {
  it('a traumatized hero talks about nothing else', () => {
    const s0 = roster(61)
    const h = living(s0)[1]!
    const s: GameState = { ...s0, heroes: { ...s0.heroes, [h.id]: { ...h, life: { ...lifeOf(h), trauma: { kind: 'burnout' as const, sinceDay: 0, consoledDay: -1 } } } } }
    const lines = ['a', 'b', 'c', 'd'].map((salt) => speak(s, s.heroes[h.id]!, false, salt))
    expect(lines.filter((l) => /nothing left|stop|shake|turn|released/.test(l)).length).toBeGreaterThanOrEqual(3)
  })

  it('every new chronicle kind and memory kind has a line', () => {
    const s = roster(62)
    const [a, b] = living(s)
    const kinds: ChronicleEntry['kind'][] = ['withdrawn', 'burnout', 'recovered', 'favoritism', 'collection', 'tryout']
    for (const kind of kinds) {
      const line = chronicleLine(s, { at: 0, kind, heroIds: [a!.id, b!.id], detail: kind === 'collection' ? 'glow_stick' : undefined })
      expect(line, kind).toMatch(/\w/)
      expect(line).not.toContain('{')
    }
    for (const kind of ['withdrew', 'burnedOut', 'recovered', 'turnedInstructor', 'collection', 'wonTryout', 'lostTryout', 'jealous'] as const) {
      const line = memoryLine(s, { kind, day: 0, other: b!.id, detail: 'glow_stick', weight: 50 })
      expect(line).not.toContain('{')
    }
  })
})
