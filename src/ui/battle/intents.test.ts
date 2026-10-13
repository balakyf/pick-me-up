import { describe, expect, it } from 'vitest'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { HEAVY_SHARE, INTENT_LEAD_ACTIONS, findIntents, intentsAt, isAuthoredSkill } from './intents'
import { SEEDS, floorLog, type EventSpec } from './__fixtures__/logs'

const base: Omit<CombatUnitInit, 'id' | 'name' | 'side'> = { line: 'front', unitClass: 'warrior', element: 'fire', level: 1, maxHP: 100, maxSP: 0, cp: 10 }
const A: CombatUnitInit = { ...base, id: 'h_a', name: 'Ada', side: 'hero' }
const G: CombatUnitInit = { ...base, id: 'e_g', name: 'Goblin', side: 'enemy', unitClass: null }
const W: CombatUnitInit = { ...base, id: 'e_w', name: 'Wolf', side: 'enemy', unitClass: null }

function mk(events: Array<EventSpec>): CombatLog {
  return { seed: 1, floor: 2, encounterContext: 'tower', unitsInit: [A, G, W], events: events.map((e, seq) => ({ ...e, seq }) as CombatEvent), outcome: 'win', rngDraws: 0 }
}

describe('isAuthoredSkill', () => {
  it('knows named skills from basic attacks', () => {
    expect(isAuthoredSkill('power_strike')).toBe(true)
    expect(isAuthoredSkill('basic')).toBe(false)
    expect(isAuthoredSkill('e_basic')).toBe(false)
  })
})

describe('findIntents', () => {
  const log = mk([
    { tick: 0, kind: 'battle-start', heroIds: ['h_a'], enemyIds: ['e_g'] },
    { tick: 1, kind: 'act', actorId: 'h_a', skillId: 'basic', targetId: 'e_g' }, // act 0, index 1
    { tick: 1, kind: 'hit', actorId: 'h_a', targetId: 'e_g', amount: 50, crit: false, hpAfter: 50 },
    { tick: 2, kind: 'act', actorId: 'e_g', skillId: 'e_basic', targetId: 'h_a' }, // act 1: a scratch
    { tick: 2, kind: 'hit', actorId: 'e_g', targetId: 'h_a', amount: 10, crit: false, hpAfter: 90 },
    { tick: 3, kind: 'act', actorId: 'h_a', skillId: 'basic', targetId: 'e_g' }, // act 2, index 5
    { tick: 3, kind: 'hit', actorId: 'h_a', targetId: 'e_g', amount: 10, crit: false, hpAfter: 40 },
    { tick: 4, kind: 'act', actorId: 'e_g', skillId: 'e_basic', targetId: 'h_a' }, // act 3: HEAVY (40%), index 7
    { tick: 4, kind: 'hit', actorId: 'e_g', targetId: 'h_a', amount: 40, crit: false, hpAfter: 50 },
    { tick: 5, kind: 'wave-spawn', wave: 1, enemyIds: ['e_w'] }, // index 9
    { tick: 5, kind: 'act', actorId: 'e_w', skillId: 'power_strike', targetId: 'h_a' }, // act 4: a named skill, index 10
    { tick: 5, kind: 'hit', actorId: 'e_w', targetId: 'h_a', amount: 5, crit: false, hpAfter: 45 },
    { tick: 6, kind: 'end', outcome: 'win' },
  ])
  const intents = findIntents(log)

  it('flags heavy blows (≥30% of max HP) and every named skill, never a scratch or a hero’s action', () => {
    expect(intents.map((i) => [i.actorId, i.kind])).toEqual([
      ['e_g', 'heavy'],
      ['e_w', 'skill'],
    ])
    expect(intents[0]!.share).toBeCloseTo(0.4)
    expect(intents[0]!.targetId).toBe('h_a')
    expect(HEAVY_SHARE).toBe(0.3)
  })

  it('shows the warning two actions ahead, or from the foe’s arrival if it came later', () => {
    const heavy = intents[0]!
    expect(heavy.actCursor).toBe(8)
    expect(heavy.showCursor).toBe(4) // from the frame of act 1 (index 3)
    const skill = intents[1]!
    expect(skill.showCursor).toBe(10) // the wolf only arrives at the wave (frame 10)
    expect(intentsAt(intents, 4).map((i) => i.actorId)).toEqual(['e_g'])
    expect(intentsAt(intents, 8)).toEqual([]) // the blow is falling: the warning gives way
    expect(intentsAt(intents, 3)).toEqual([])
  })

  it('on real fights, every big blow on the party is flagged at least 2 actions ahead', () => {
    let checked = 0
    for (const seed of SEEDS) {
      for (const floor of [3, 8, 12, 15]) {
        const l = floorLog(seed, floor)
        const found = findIntents(l)
        const unit = new Map(l.unitsInit.map((u) => [u.id, u]))
        const acts = l.events.map((e, i) => ({ e, i })).filter(({ e }) => e.kind === 'act')
        acts.forEach(({ e, i }, j) => {
          if (e.kind !== 'act' || unit.get(e.actorId)?.side !== 'enemy' || unit.get(e.targetId)?.side !== 'hero') return
          let dmg = 0
          for (let k = i + 1; k < l.events.length && l.events[k]!.kind !== 'act'; k++) {
            const h = l.events[k]!
            if (h.kind === 'hit' && h.targetId === e.targetId && h.actorId === e.actorId) dmg += h.amount
          }
          const big = isAuthoredSkill(e.skillId) || dmg >= unit.get(e.targetId)!.maxHP * HEAVY_SHARE
          const it = found.find((x) => x.actCursor === i + 1)
          if (!big) {
            expect(it).toBeUndefined()
            return
          }
          checked++
          expect(it).toBeDefined()
          // Single-wave fights: the warning appears no later than the action two actions earlier.
          const hasWaves = l.events.some((x) => x.kind === 'wave-spawn')
          if (j >= INTENT_LEAD_ACTIONS && !hasWaves) expect(it!.showCursor).toBeLessThanOrEqual(acts[j - INTENT_LEAD_ACTIONS]!.i + 1)
          expect(it!.showCursor).toBeLessThan(it!.actCursor)
        })
      }
    }
    expect(checked).toBeGreaterThan(5)
  })

  it('intentsAt keeps at most two, soonest first', () => {
    const many = [
      { actorId: 'a', targetId: 'h', kind: 'heavy' as const, skillId: 'x', amount: 1, share: 1, showCursor: 0, actCursor: 9 },
      { actorId: 'b', targetId: 'h', kind: 'heavy' as const, skillId: 'x', amount: 1, share: 1, showCursor: 0, actCursor: 5 },
      { actorId: 'c', targetId: 'h', kind: 'heavy' as const, skillId: 'x', amount: 1, share: 1, showCursor: 0, actCursor: 7 },
    ]
    expect(intentsAt(many, 1).map((i) => i.actorId)).toEqual(['b', 'c'])
  })

  it('intentsAt shows one tag per foe (its next blow), so two never print over each other', () => {
    const two = [
      { actorId: 'a', targetId: 'h', kind: 'heavy' as const, skillId: 'x', amount: 1, share: 1, showCursor: 0, actCursor: 9 },
      { actorId: 'a', targetId: 'k', kind: 'skill' as const, skillId: 'y', amount: 1, share: 1, showCursor: 0, actCursor: 5 },
      { actorId: 'b', targetId: 'h', kind: 'heavy' as const, skillId: 'x', amount: 1, share: 1, showCursor: 0, actCursor: 7 },
    ]
    expect(intentsAt(two, 1).map((i) => [i.actorId, i.actCursor])).toEqual([
      ['a', 5],
      ['b', 7],
    ])
  })
})

