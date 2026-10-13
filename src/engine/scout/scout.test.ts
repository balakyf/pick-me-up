import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { createStore, reduce, attemptFloorWithResult } from '../store'
import { TUNING } from '../tuning'
import type { GameState } from '../types'
import { scoutFloor, suggestParty, threatFor, canFight, scoutUnits, namedThreats, THREAT_REASONS } from '.'
import { ordersAllowed, buildEncounter } from '../tower'
import { floorKindBase } from '../climb'
import { buildEnemyUnit } from '../unit'
import { ENEMY_TEMPLATES } from '../content'

function roster(seed: number, n = 8): GameState {
  let s: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'SUMMON' })
  return s
}

describe('scouting', () => {
  it('reports the floor’s enemies, the party’s strength and a threat band', () => {
    const s = roster(1)
    const r = scoutFloor(s)!
    expect(r.floor).toBe(1)
    expect(r.enemies.length).toBeGreaterThan(0)
    expect(r.enemies.reduce((n, e) => n + e.count, 0)).toBeGreaterThan(0)
    expect(r.partyCp).toBeGreaterThan(0)
    expect(['safe', 'fair', 'risky', 'deadly']).toContain(r.threat)
  })

  it('threat bands follow the bots’ calibration', () => {
    expect(threatFor(2).threat).toBe('safe')
    expect(threatFor(1.2).threat).toBe('fair')
    expect(threatFor(0.7).threat).toBe('risky')
    expect(threatFor(0.3).threat).toBe('deadly')
  })

  it('suggests the strongest rested heroes, sturdy in front', () => {
    const s = roster(2, 10)
    const p = suggestParty(s)
    const ids = p.slots.filter(Boolean)
    expect(ids).toHaveLength(5)
    for (const id of ids) expect(canFight(s.heroes[id!]!)).toBe(true)
    expect(new Set(ids).size).toBe(5)
  })

  it('skips broken heroes', () => {
    const s0 = roster(3, 6)
    const tired = Object.values(s0.heroes)[0]!
    const s = { ...s0, heroes: { ...s0.heroes, [tired.id]: { ...tired, sanity: 5 } } }
    expect(suggestParty(s).slots).not.toContain(tired.id)
  })
})

describe('the honest scout (spec 2026-10-12 S12)', () => {
  const party = (seed: number, floor: number): GameState => {
    const s = roster(seed, 8)
    const p = reduce(s, { type: 'SET_PARTY', ...suggestParty(s) })
    return { ...p, tower: { ...p.tower, currentFloor: floor, highestCleared: floor - 1, kind: floorKindBase(floor) } }
  }

  it('reads the party’s real battle units against the encounter actually built', () => {
    const s = party(4, 8)
    const r = scoutFloor(s)!
    const enc = buildEncounter(s, 8)
    const foeCp = enc.waves.reduce((n, w) => n + w.units.reduce((m, u) => m + (u.keywords.some((k) => k.kind === 'looming') ? 0 : u.cp), 0), 0)
    expect(r.budget).toBe(foeCp)
    const heroes = s.party.slots.map((id) => (id ? s.heroes[id] : undefined)).filter((h): h is NonNullable<typeof h> => !!h)
    expect(r.partyCp).toBe(scoutUnits(s, heroes).reduce((n, u) => n + u.cp, 0))
    expect(r.ratio).toBe(Math.round((r.partyCp / r.budget) * 100) / 100)
    // The units are the ones playFloor fields: their CP matches the battle log.
    const fielded = attemptFloorWithResult(s).result.result.log.unitsInit.filter((u) => u.side === 'hero' && !u.isNpc)
    expect(fielded.reduce((n, u) => n + u.cp, 0)).toBe(r.partyCp)
  })

  it('shows the kind, the rout threshold, Last Stand, the mercy cap and 1-2 named threats', () => {
    const s = party(5, 8)
    const r = scoutFloor(s)!
    expect(r.kind).toBe('path')
    expect(r.rout).toBe(TUNING.climb.rout.path)
    expect(r.lastStandPct).toBe(0)
    expect(typeof r.mercyCapped).toBe('boolean')
    expect(r.nemesis).toBeNull()
    expect(r.threats.length).toBeGreaterThanOrEqual(1)
    expect(r.threats.length).toBeLessThanOrEqual(2)
    for (const t of r.threats) expect(Object.values(THREAT_REASONS)).toContain(t.why)
    // A Skull floor is scouted as an Elite.
    expect(scoutFloor({ ...s, tower: { ...s.tower, kind: 'elite' } })!.kind).toBe('elite')
    // A party no bigger than the rout threshold can still be wiped: no rout promised.
    const two = Object.values(s.heroes).slice(0, 2)
    expect(scoutFloor(s, two)!.rout).toBeNull()
  })

  it('names a much faster enemy first, as fast', () => {
    const slow = { ...buildEnemyUnit(ENEMY_TEMPLATES.goblin!, 10, 'g', {}) }
    const quick = { ...buildEnemyUnit(ENEMY_TEMPLATES.goblin!, 10, 'q', {}), name: 'Quick', stats: { ...slow.stats, spd: slow.stats.spd * 4 } }
    const s = party(6, 8)
    const heroes = Object.values(s.heroes).slice(0, 3)
    const units = scoutUnits(s, heroes)
    const threats = namedThreats([slow, { ...slow, id: 'g2' }, quick], units, new Set())
    expect(threats[0]).toMatchObject({ name: 'Quick', why: THREAT_REASONS.fast, count: 1 })
  })

  it('estimates the opening blow from the strongest skill the enemy can open with', () => {
    const s = party(6, 8)
    const units = scoutUnits(s, Object.values(s.heroes).slice(0, 3))
    const base = buildEnemyUnit(ENEMY_TEMPLATES.goblin!, 10, 'g', {})
    const strike = namedThreats([base], units, new Set())[0]!.hit!
    expect(strike).toBeGreaterThan(0)
    // A heavy physical skill it can afford at full SP lands harder; one it cannot afford does not count.
    const cleave = { id: 'cleave', name: 'Cleave', skillMult: 2.5, damageType: 'physical' as const, element: null, target: 'single' as const, spCost: 0 }
    const heavy = { ...base, skills: [...base.skills, cleave] }
    expect(namedThreats([heavy], units, new Set())[0]!.hit!).toBeGreaterThan(strike * 2)
    const dear = { ...base, skills: [...base.skills, { ...cleave, spCost: base.currentSP + 1 }] }
    expect(namedThreats([dear], units, new Set())[0]!.hit).toBe(strike)
  })

  it('a death’s lesson reveals the family’s weakness even on an unstudied floor', () => {
    // The first floor whose foes include an elemental family (a plain physical foe has no
    // element to exploit, so a lesson can only mark it).
    const elemental = (st: GameState) => buildEncounter(st, st.tower.currentFloor).waves.flatMap((w) => w.units).find((u) => u.family !== undefined && u.element !== 'physical')
    let s = party(7, 3)
    while (elemental(s) === undefined && s.tower.currentFloor < 60) s = { ...s, tower: { ...s.tower, currentFloor: s.tower.currentFloor + 1, kind: 'path' } }
    const r0 = scoutFloor(s)!
    const fam = elemental(s)?.family
    expect(fam).toBeDefined()
    expect(r0.studied).toBe(false)
    expect(r0.enemies.every((e) => e.weakness === undefined)).toBe(true)
    const taught = { ...s, life: { ...s.life, legacy: { ...s.life.legacy, lessons: [fam!] } } }
    const r1 = scoutFloor(taught)!
    const lesson = r1.enemies.filter((e) => e.family === fam)
    expect(lesson.length).toBeGreaterThan(0)
    for (const e of lesson) {
      expect(e.lesson).toBe(true)
      expect(e.weakness).toBeDefined()
    }
  })
})

describe('mid-battle orders', () => {
  function party(seed: number): GameState {
    const s = roster(seed, 5)
    const ids = Object.keys(s.heroes).slice(0, 5)
    return reduce(s, { type: 'SET_PARTY', slots: ids as GameState['party']['slots'], lines: ['front', 'front', 'mid', 'back', 'back'] })
  }

  it('an order replays the fight exactly up to its tick', () => {
    const s = party(11)
    const plain = attemptFloorWithResult(s).result.result.log
    const at = Math.max(2, Math.floor((plain.events.at(-1)?.tick ?? 4) / 2))
    const ordered = attemptFloorWithResult(s, undefined, undefined, undefined, [{ tick: at, kind: 'retreat' }]).result.result.log
    const before = (log: typeof plain) => log.events.filter((e) => e.tick < at)
    expect(before(ordered)).toEqual(before(plain))
  })

  it('retreat ends the fight at once: nothing is won, the living come home', () => {
    const s = party(12)
    const r = attemptFloorWithResult(s, undefined, undefined, undefined, [{ tick: 1, kind: 'retreat' }]).result
    expect(r.result.outcome).toBe('retreat')
    expect(r.cleared).toBe(false)
    expect(r.goldAwarded).toBe(0)
    expect(r.fallenHeroIds).toEqual([])
    expect(r.result.log.events.some((e) => e.kind === 'order')).toBe(true)
  })

  it('the Tactical Center caps focus/protect orders; retreat is always allowed', () => {
    const s = party(13)
    const n = ordersAllowed(s)
    const enemy = attemptFloorWithResult(s).result.result.log.unitsInit.find((u) => u.side === 'enemy')!.id
    const tooMany = Array.from({ length: n + 1 }, (_, i) => ({ tick: 2 + i, kind: 'focus' as const, enemyId: enemy }))
    expect(() => attemptFloorWithResult(s, undefined, undefined, undefined, tooMany)).toThrow(/orders/)
    expect(() => attemptFloorWithResult(s, undefined, undefined, undefined, [...tooMany.slice(0, n), { tick: 9, kind: 'retreat' }])).not.toThrow()
  })

  it('the store revises the attempt it just recorded (and only that)', () => {
    const store = createStore({})
    store.dispatch({ type: 'NEW_ACCOUNT', seed: 21, now: 0 })
    const pre = store.getState()!
    store.dispatch({ type: 'ATTEMPT_FLOOR' })
    const revised = store.revise({ type: 'ATTEMPT_FLOOR', orders: [{ tick: 1, kind: 'retreat' }] })
    expect(revised).toEqual(reduce(pre, { type: 'ATTEMPT_FLOOR', orders: [{ tick: 1, kind: 'retreat' }] }))
    store.dispatch({ type: 'TICK' })
    expect(() => store.revise({ type: 'ATTEMPT_FLOOR' })).toThrow(/revise/)
  })
})
