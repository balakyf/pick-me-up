import { describe, expect, it } from 'vitest'
import { createAccount } from '../../engine/account'
import { attemptFloorWithResult } from '../../engine/store'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import {
  DECISIVE_TUTORIAL_STEP,
  decisiveTutorialDue,
  findDangerMoment,
  findDecisive,
  killerOf,
  savedCursor,
  survives,
} from './decisive'
import { SEEDS, atFloor, floorLog, partyIdsOf, type EventSpec } from './__fixtures__/logs'

const base: Omit<CombatUnitInit, 'id' | 'name' | 'side'> = { line: 'front', unitClass: 'warrior', element: 'fire', level: 1, maxHP: 100, maxSP: 0, cp: 10 }
const A: CombatUnitInit = { ...base, id: 'h_a', name: 'Ada', side: 'hero' }
const B: CombatUnitInit = { ...base, id: 'h_b', name: 'Bo', side: 'hero' }
const P: CombatUnitInit = { ...base, id: 'npc', name: 'Princess Priasis', side: 'hero', isNpc: true }
const G: CombatUnitInit = { ...base, id: 'e_g', name: 'Goblin', side: 'enemy', unitClass: null }
const O: CombatUnitInit = { ...base, id: 'e_o', name: 'Ogre', side: 'enemy', unitClass: null }

function mk(events: Array<EventSpec>, units = [A, B, P, G, O]): CombatLog {
  return {
    seed: 1,
    floor: 4,
    encounterContext: 'tower',
    unitsInit: units,
    events: events.map((e, seq) => ({ ...e, seq }) as CombatEvent),
    outcome: 'wipe',
    rngDraws: 0,
  }
}

const synthetic = mk([
  { tick: 0, kind: 'battle-start', heroIds: ['h_a', 'h_b', 'npc'], enemyIds: ['e_g', 'e_o'] },
  { tick: 2, kind: 'act', actorId: 'e_g', skillId: 'e_basic', targetId: 'npc' },
  { tick: 2, kind: 'hit', actorId: 'e_g', targetId: 'npc', amount: 100, crit: false, hpAfter: 0 },
  { tick: 2, kind: 'death', unitId: 'npc' }, // an NPC's death is not the Master's decision
  { tick: 4, kind: 'act', actorId: 'e_g', skillId: 'e_basic', targetId: 'h_b' },
  { tick: 4, kind: 'hit', actorId: 'e_g', targetId: 'h_b', amount: 60, crit: false, hpAfter: 40 },
  { tick: 6, kind: 'act', actorId: 'h_a', skillId: 'basic', targetId: 'e_o' },
  { tick: 6, kind: 'hit', actorId: 'h_a', targetId: 'e_o', amount: 5, crit: false, hpAfter: 95 },
  { tick: 7, kind: 'act', actorId: 'e_o', skillId: 'e_basic', targetId: 'h_b' }, // index 8
  { tick: 7, kind: 'hit', actorId: 'e_o', targetId: 'h_b', amount: 50, crit: false, hpAfter: 0 },
  { tick: 7, kind: 'death', unitId: 'h_b' }, // index 10: the first hero death
  { tick: 9, kind: 'act', actorId: 'e_o', skillId: 'e_basic', targetId: 'h_a' },
  { tick: 9, kind: 'hit', actorId: 'e_o', targetId: 'h_a', amount: 100, crit: false, hpAfter: 0 },
  { tick: 9, kind: 'death', unitId: 'h_a' }, // index 13
  { tick: 9, kind: 'end', outcome: 'wipe' },
])

describe('findDecisive', () => {
  it('returns the last event before the first hero death tick, the killer, and an order tick that lands in time', () => {
    const d = findDecisive(synthetic, ['h_a', 'h_b'])!
    expect(d).not.toBeNull()
    expect(d.heroId).toBe('h_b')
    expect(d.deathIndex).toBe(10)
    expect(d.eventIndex).toBe(7) // the hit at tick 6; index 8 is already the fatal tick 7
    expect(d.cursorIndex).toBe(8)
    expect(d.killerId).toBe('e_o') // the LAST enemy to hit Bo, not the goblin
    expect(d.deathTick).toBe(7)
    expect(d.orderTick).toBe(7)
    expect(d.orderTick).toBeLessThanOrEqual(d.deathTick)
    expect(d.kind).toBe('death')
  })

  it('ignores NPC deaths (they are not passed in as heroes)', () => {
    const d = findDecisive(synthetic, ['h_a', 'h_b'])!
    expect(d.heroId).not.toBe('npc')
  })

  it('returns null when no hero dies', () => {
    const noDeath = mk(synthetic.events.slice(0, 9).map(({ seq: _s, ...e }) => e))
    expect(findDecisive(noDeath, ['h_a', 'h_b'])).toBeNull()
    expect(findDecisive(synthetic, [])).toBeNull()
  })

  it('scans from an index (re-arming after a re-resolve)', () => {
    const later = findDecisive(synthetic, ['h_a', 'h_b'], 11)!
    expect(later.heroId).toBe('h_a')
    expect(later.cursorIndex).toBeGreaterThanOrEqual(11)
    expect(later.killerId).toBe('e_o')
    // Nothing to pause on if the moment is already behind the cursor.
    expect(findDecisive(synthetic, ['h_b'], 9)).toBeNull()
  })

  it('skips heroes already offered a moment (the re-arm looks for someone else)', () => {
    const next = findDecisive(synthetic, ['h_a', 'h_b'], 0, ['h_b'])!
    expect(next.heroId).toBe('h_a')
    expect(next.deathIndex).toBe(13)
    expect(synthetic.events[next.eventIndex]!.tick).toBeLessThan(9)
    expect(findDecisive(synthetic, ['h_a', 'h_b'], 0, ['h_a', 'h_b'])).toBeNull()
  })

  it('killerOf only names foes', () => {
    expect(killerOf(synthetic, 'h_b', 10)).toBe('e_o')
    expect(killerOf(synthetic, 'h_b', 6)).toBe('e_g')
    expect(killerOf(synthetic, 'h_a', 5)).toBeNull()
  })

  it('on real wipes, an order at the decisive tick re-resolves the same fight up to that point', () => {
    for (const seed of SEEDS) {
      const pre = atFloor(seed, 15)
      const log = floorLog(seed, 15)
      const d = findDecisive(log, partyIdsOf(log))
      expect(d).not.toBeNull()
      const next = attemptFloorWithResult(pre, undefined, undefined, undefined, [{ tick: d!.orderTick, kind: 'protect', allyId: d!.heroId }]).result.result.log
      const resume = next.events.findIndex((e) => e.tick >= d!.orderTick)
      expect(resume).toBe(d!.cursorIndex)
      expect(next.events.slice(0, resume)).toEqual(log.events.slice(0, resume))
      // The order lands at the start of its tick: before the fatal blow.
      const orderAt = next.events.findIndex((e) => e.kind === 'order')
      expect(orderAt).toBe(resume)
      expect(next.events[orderAt]!.tick).toBeLessThanOrEqual(d!.deathTick)
    }
  })
})

describe('findDangerMoment (the tutorial when nobody would die)', () => {
  it('pauses before the heaviest blow on the party', () => {
    const noDeath = mk(synthetic.events.slice(0, 9).map(({ seq: _s, ...e }) => e))
    const d = findDangerMoment(noDeath, ['h_a', 'h_b'])!
    expect(d.kind).toBe('danger')
    expect(d.heroId).toBe('h_b')
    expect(d.killerId).toBe('e_g')
    expect(d.cursorIndex).toBe(4) // after the NPC's death at tick 2; the blow comes at tick 4
    expect(findDangerMoment(noDeath, ['h_a', 'h_b'], 0, 0.9)).toBeNull()
  })
})

describe('survives / savedCursor', () => {
  it('finds where a rescued hero would have died', () => {
    expect(survives(synthetic, 'h_b')).toBe(false)
    expect(savedCursor(synthetic, 'h_b', 7)).toBeNull()
    expect(survives(synthetic, 'npc')).toBe(false)
    const rescued = mk([
      { tick: 0, kind: 'battle-start', heroIds: ['h_a', 'h_b'], enemyIds: ['e_o'] },
      { tick: 7, kind: 'order', order: { tick: 7, kind: 'protect', allyId: 'h_b' } },
      { tick: 7, kind: 'act', actorId: 'e_o', skillId: 'e_basic', targetId: 'h_a' },
      { tick: 7, kind: 'hit', actorId: 'e_o', targetId: 'h_a', amount: 10, crit: false, hpAfter: 90 },
      { tick: 8, kind: 'end', outcome: 'win' },
    ])
    expect(survives(rescued, 'h_b')).toBe(true)
    expect(savedCursor(rescued, 'h_b', 7)).toBe(3)
    expect(savedCursor(rescued, 'h_b', 99)).toBe(rescued.events.length)
  })
})

describe('decisiveTutorialDue (S5)', () => {
  it('is due on the first fight with a death, or on F3, until the guide step is done', () => {
    const s = createAccount(7)
    const quiet = { ...synthetic, floor: 1, events: synthetic.events.slice(0, 9) }
    expect(decisiveTutorialDue(s, quiet)).toBe(false)
    expect(decisiveTutorialDue(s, { ...quiet, floor: 3 })).toBe(true)
    // From F3, a fight in which no foe ever touches the party has nothing to teach on.
    const untouched = { ...quiet, floor: 3, events: quiet.events.filter((e) => !(e.kind === 'hit' && e.actorId.startsWith('e_'))) }
    expect(decisiveTutorialDue(s, untouched)).toBe(false)
    expect(decisiveTutorialDue(s, { ...synthetic, floor: 1 })).toBe(true)
    const seen = { ...s, life: { ...s.life, guide: { ...s.life.guide, done: [DECISIVE_TUTORIAL_STEP] } } }
    expect(decisiveTutorialDue(seen, { ...synthetic, floor: 1 })).toBe(false)
    expect(decisiveTutorialDue(null, synthetic)).toBe(false)
  })
})
