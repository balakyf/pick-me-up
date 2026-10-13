import { describe, expect, it } from 'vitest'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { FR } from '../i18n/fr'
import {
  BARK_COOLDOWN_MS,
  BARK_LINES,
  BARK_PRIORITY_GAP_MS,
  barkLine,
  canBark,
  firstName,
  planBarks,
  type BarkKind,
} from './narrator'
import { SEEDS, floorLog, type EventSpec } from './__fixtures__/logs'

const base: Omit<CombatUnitInit, 'id' | 'name' | 'side'> = { line: 'front', unitClass: 'warrior', element: 'fire', level: 1, maxHP: 100, maxSP: 0, cp: 10 }
const units: CombatUnitInit[] = [
  { ...base, id: 'h_a', name: 'Ada Lark', side: 'hero' },
  { ...base, id: 'h_b', name: 'Bo Reed', side: 'hero' },
  { ...base, id: 'h_c', name: 'Cy Moss', side: 'hero' },
  { ...base, id: 'e_g', name: 'Goblin', side: 'enemy', unitClass: null },
]
function mk(events: Array<EventSpec>): CombatLog {
  return { seed: 9, floor: 4, encounterContext: 'tower', unitsInit: units, events: events.map((e, seq) => ({ ...e, seq }) as CombatEvent), outcome: 'win', rngDraws: 0 }
}

describe('planBarks', () => {
  it('a flawless win: the party’s first crit once, then the flawless line at the end', () => {
    const log = mk([
      { tick: 0, kind: 'battle-start', heroIds: ['h_a', 'h_b', 'h_c'], enemyIds: ['e_g'] },
      { tick: 1, kind: 'hit', actorId: 'e_g', targetId: 'h_a', amount: 5, crit: true, hpAfter: 95 }, // a foe's crit: no
      { tick: 1, kind: 'hit', actorId: 'h_a', targetId: 'e_g', amount: 30, crit: true, hpAfter: 70 },
      { tick: 2, kind: 'hit', actorId: 'h_b', targetId: 'e_g', amount: 30, crit: true, hpAfter: 40 },
      { tick: 3, kind: 'death', unitId: 'e_g' },
      { tick: 3, kind: 'end', outcome: 'win' },
    ])
    const b = planBarks(log)
    expect(b.map((x) => [x.kind, x.cursor])).toEqual([
      ['firstCrit', 3],
      ['flawless', 6],
    ])
  })

  it('a losing fight: a near-wipe once, and a eulogy (with first name) for each fallen hero', () => {
    const log = mk([
      { tick: 0, kind: 'battle-start', heroIds: ['h_a', 'h_b', 'h_c'], enemyIds: ['e_g'] },
      { tick: 1, kind: 'hit', actorId: 'e_g', targetId: 'h_a', amount: 100, crit: false, hpAfter: 0 },
      { tick: 1, kind: 'death', unitId: 'h_a' },
      { tick: 2, kind: 'hit', actorId: 'e_g', targetId: 'h_b', amount: 100, crit: false, hpAfter: 0 },
      { tick: 2, kind: 'death', unitId: 'h_b' },
      { tick: 3, kind: 'hit', actorId: 'e_g', targetId: 'h_c', amount: 100, crit: false, hpAfter: 0 },
      { tick: 3, kind: 'death', unitId: 'h_c' },
      { tick: 3, kind: 'end', outcome: 'wipe' },
    ])
    const b = planBarks(log)
    expect(b.filter((x) => x.kind === 'heroDeath').map((x) => x.vars.name)).toEqual(['Ada', 'Bo', 'Cy'])
    expect(b.filter((x) => x.kind === 'nearWipe')).toHaveLength(1)
    expect(b.find((x) => x.kind === 'nearWipe')!.cursor).toBe(5) // one left of three
    expect(b.some((x) => x.kind === 'flawless')).toBe(false)
  })

  it('is deterministic on real fights', () => {
    for (const seed of SEEDS) {
      const l = floorLog(seed, 15)
      expect(planBarks(l)).toEqual(planBarks(l))
      expect(planBarks(l).some((b) => b.kind === 'heroDeath')).toBe(true)
    }
  })
})

describe('pacing of barks', () => {
  it('waits 10 s between ordinary barks; a death or a rescue may cut in after 3 s', () => {
    expect(canBark('firstCrit', 0, null)).toBe(true)
    expect(canBark('firstCrit', BARK_COOLDOWN_MS - 1, 0)).toBe(false)
    expect(canBark('flawless', BARK_COOLDOWN_MS, 0)).toBe(true)
    expect(canBark('heroDeath', BARK_PRIORITY_GAP_MS - 1, 0)).toBe(false)
    expect(canBark('heroDeath', BARK_PRIORITY_GAP_MS, 0)).toBe(true)
    expect(canBark('saved', BARK_PRIORITY_GAP_MS, 0)).toBe(true)
  })

  it('variants are picked by hash, never at random', () => {
    expect(barkLine('firstCrit', 'x')).toBe(barkLine('firstCrit', 'x'))
    const picks = new Set(Array.from({ length: 40 }, (_, i) => barkLine('heroDeath', String(i))))
    expect(picks.size).toBeGreaterThan(1)
    for (const p of picks) expect(BARK_LINES.heroDeath).toContain(p)
    expect(firstName('Mira Vale')).toBe('Mira')
  })
})

describe('every bark line has French with the same placeholders', () => {
  it('covers all lines', () => {
    for (const kind of Object.keys(BARK_LINES) as BarkKind[]) {
      for (const line of BARK_LINES[kind]) {
        expect(FR[line], line).toBeTruthy()
        const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
        expect(ph(FR[line]!)).toEqual(ph(line))
      }
    }
  })

  it('never says "one left standing" when the near-wipe is about life, not headcount', () => {
    const ONE = 'Master… one left standing. Choose carefully.'
    for (let seed = 0; seed < 40; seed++) {
      const log = {
        ...mk([
          { tick: 0, kind: 'battle-start', heroIds: ['h_a', 'h_b', 'h_c'], enemyIds: ['e_g'] },
          { tick: 1, kind: 'hit', actorId: 'e_g', targetId: 'h_a', amount: 80, crit: false, hpAfter: 20 },
          { tick: 2, kind: 'hit', actorId: 'e_g', targetId: 'h_b', amount: 80, crit: false, hpAfter: 20 },
          { tick: 3, kind: 'hit', actorId: 'e_g', targetId: 'h_c', amount: 90, crit: false, hpAfter: 10 },
          { tick: 4, kind: 'end', outcome: 'timeout' },
        ]),
        seed,
      }
      const near = planBarks(log).find((b) => b.kind === 'nearWipe')!
      expect(near.cursor).toBe(4) // 50 of 300 left: under a quarter, all three standing
      expect(near.line).not.toBe(ONE)
    }
  })
})

