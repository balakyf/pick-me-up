import { describe, it, expect } from 'vitest'
import { simulate, retreatTick } from './sim'
import { summarize } from './report'
import { TUNING } from '../engine/tuning'
import type { CombatLog, CombatUnitInit } from '../engine/types'

describe('balance simulator', () => {
  it('is deterministic for a seed', () => {
    const a = simulate('casual', 42, 3)
    const b = simulate('casual', 42, 3)
    expect(a.days).toEqual(b.days)
    expect(a.log).toEqual(b.log)
  })

  it('a new player climbs through the first act within a few days, and nobody softlocks', () => {
    for (const p of ['casual', 'engaged'] as const) {
      const r = simulate(p, 7, 4)
      const last = r.days[r.days.length - 1]!
      expect(last.highestCleared).toBeGreaterThanOrEqual(5)
      expect(last.alive).toBeGreaterThan(0)
    }
  })

  it('the engaged bot pulls the life and challenge levers; the casual one keeps it simple', () => {
    const e = simulate('engaged', 7, 3)
    expect(e.levers.ASSIGN_JOB).toBeGreaterThan(0)
    expect(e.levers.WEEKLY_TRIAL).toBeGreaterThan(0)
    const c = simulate('casual', 7, 3)
    expect(c.levers.ASSIGN_JOB ?? 0).toBe(0)
    expect(c.levers.WEEKLY_TRIAL ?? 0).toBe(0)
    expect(c.levers.RETREAT ?? 0).toBe(0)
  })

  it("a payer's Advanced pulls are metered by the crystal from day one", () => {
    const w = simulate('whale', 7, 2)
    const perRealDay = 3 * TUNING.gacha.advanced.rechargePerDay
    expect(w.days[0]!.advPulls).toBeLessThanOrEqual(TUNING.gacha.advanced.startCharge + perRealDay)
    expect(w.days[1]!.advPulls).toBeLessThanOrEqual(TUNING.gacha.advanced.startCharge + 2 * perRealDay)
  })

  it('the report summarizes each profile', () => {
    const text = summarize([simulate('casual', 1, 2)])
    expect(text).toContain('## casual')
    expect(text).toContain('Act I')
  })
})

describe('retreatTick', () => {
  const unit = (id: string, side: 'hero' | 'enemy'): CombatUnitInit => ({ id, name: id, side, line: 'front', unitClass: null, element: 'physical', level: 1, maxHP: 90, maxSP: 0, cp: 1 })
  const log = (events: CombatLog['events']): CombatLog => ({ seed: 0, floor: 1, encounterContext: 'tower', unitsInit: [unit('h1', 'hero'), unit('e1', 'enemy')], events, outcome: 'wipe', rngDraws: 0 })

  it('calls the retreat the beat after the first hero staggers below a third of their HP', () => {
    const l = log([
      { seq: 0, tick: 3, kind: 'hit', actorId: 'e1', targetId: 'h1', amount: 40, crit: false, hpAfter: 50 },
      { seq: 1, tick: 5, kind: 'hit', actorId: 'h1', targetId: 'e1', amount: 80, crit: false, hpAfter: 10 },
      { seq: 2, tick: 7, kind: 'hit', actorId: 'e1', targetId: 'h1', amount: 30, crit: false, hpAfter: 20 },
    ])
    expect(retreatTick(l)).toBe(8)
  })

  it('or the beat after a hero falls outright; never when no hero is in trouble', () => {
    expect(retreatTick(log([{ seq: 0, tick: 4, kind: 'death', unitId: 'h1' }]))).toBe(5)
    expect(retreatTick(log([{ seq: 0, tick: 4, kind: 'death', unitId: 'e1' }]))).toBeNull()
  })
})
