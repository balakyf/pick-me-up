import { describe, expect, it } from 'vitest'
import type { EventSpec } from './__fixtures__/logs'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { comboSemis, comboSeries } from './combo'

const base: Omit<CombatUnitInit, 'id' | 'name' | 'side'> = { line: 'front', unitClass: 'warrior', element: 'fire', level: 1, maxHP: 100, maxSP: 0, cp: 10 }
const units: CombatUnitInit[] = [
  { ...base, id: 'h_a', name: 'Ada', side: 'hero' },
  { ...base, id: 'npc', name: 'Key Bearer', side: 'hero', isNpc: true },
  { ...base, id: 'e_g', name: 'Goblin', side: 'enemy', unitClass: null },
]
const hit = (actorId: string, targetId: string): EventSpec => ({ tick: 1, kind: 'hit', actorId, targetId, amount: 1, crit: false, hpAfter: 50 })
const act = (actorId: string, targetId: string): EventSpec => ({ tick: 1, kind: 'act', actorId, skillId: 'basic', targetId })

function mk(events: Array<EventSpec>): CombatLog {
  return { seed: 1, floor: 1, encounterContext: 'tower', unitsInit: units, events: events.map((e, seq) => ({ ...e, seq }) as CombatEvent), outcome: 'win', rngDraws: 0 }
}

describe('comboSeries', () => {
  it('counts party hits, resets on an enemy act, and has one entry per frame', () => {
    const log = mk([
      { tick: 0, kind: 'battle-start', heroIds: ['h_a'], enemyIds: ['e_g'] },
      act('h_a', 'e_g'),
      hit('h_a', 'e_g'),
      act('npc', 'e_g'),
      hit('npc', 'e_g'), // mission allies fight on the party's side
      { tick: 1, kind: 'miss', actorId: 'h_a', targetId: 'e_g' },
      hit('h_a', 'e_g'),
      act('e_g', 'h_a'), // reset
      hit('e_g', 'h_a'), // an enemy hit never counts
      act('h_a', 'e_g'),
      hit('h_a', 'e_g'),
      { tick: 2, kind: 'end', outcome: 'win' },
    ])
    expect(comboSeries(log)).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 0, 0, 0, 1, 0])
  })

  it('a new wave resets the streak', () => {
    const log = mk([hit('h_a', 'e_g'), hit('h_a', 'e_g'), { tick: 2, kind: 'wave-spawn', wave: 1, enemyIds: [] }, hit('h_a', 'e_g')])
    expect(comboSeries(log)).toEqual([0, 1, 2, 0, 1])
  })
})

describe('comboSemis', () => {
  it('climbs the battle key’s pentatonic scale and stops at the top', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 40].map(comboSemis)).toEqual([0, 3, 5, 8, 10, 12, 15, 17, 17, 17])
    expect(comboSemis(0)).toBe(0)
    expect(comboSemis(Number.NaN)).toBe(0)
    // Every step lands on A-minor pentatonic when added to the hit's E root (MIDI 52).
    for (let n = 1; n <= 10; n++) expect([0, 2, 4, 7, 9]).toContain((52 + comboSemis(n)) % 12)
  })
})
