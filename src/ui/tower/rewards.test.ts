import { describe, expect, it } from 'vitest'
import { createAccount } from '../../engine/account'
import { TUNING } from '../../engine/tuning'
import type { FloorResult, HeroId } from '../../engine/types'
import {
  doorOutcome,
  keptOnRout,
  levelUps,
  levelsOf,
  materialLabel,
  materialRows,
  nextTeaser,
  sortieActive,
  streakPct,
  summonProgress,
  sweepMode,
} from './rewards'
import { atFloor, clearedF1, fixtureLog, fixtureResult } from './fixtures'

const log = fixtureLog([{ tick: 1, kind: 'end', outcome: 'win' }])

describe('levelUps', () => {
  it('lists heroes whose level rose since the snapshot', () => {
    const s = createAccount(5)
    const id = Object.keys(s.heroes)[0]!
    const before = levelsOf(s)
    const hero = s.heroes[id as HeroId]!
    const after = { ...s, heroes: { ...s.heroes, [id]: { ...hero, xp: { ...hero.xp, level: hero.xp.level + 2 } } } }
    const ups = levelUps(before, after)
    expect(ups).toHaveLength(1)
    expect(ups[0]).toMatchObject({ from: hero.xp.level, to: hero.xp.level + 2 })
    expect(ups[0]!.hero.id).toBe(id)
  })
  it('is empty with no snapshot, no change, or a fallen hero', () => {
    const s = createAccount(5)
    expect(levelUps(undefined, s)).toEqual([])
    expect(levelUps(levelsOf(s), s)).toEqual([])
    const id = Object.keys(s.heroes)[0]! as HeroId
    const h = s.heroes[id]!
    const dead = { ...s, heroes: { ...s.heroes, [id]: { ...h, alive: false, xp: { ...h.xp, level: h.xp.level + 1 } } } }
    expect(levelUps(levelsOf(s), dead)).toEqual([])
  })
  it('captures the real F1 clear (the starter levels up or holds)', () => {
    const { before, state } = clearedF1()
    for (const u of levelUps(levelsOf(before), state)) expect(u.to).toBeGreaterThan(u.from)
  })
})

describe('summonProgress', () => {
  const cost = TUNING.gacha.normalCostGold
  it('fills from before to after the gold and flags readiness', () => {
    const p = summonProgress(cost / 2, cost / 4)
    expect(p).toEqual({ cost, fromPct: 0.25, toPct: 0.5, ready: false, missing: cost / 2 })
  })
  it('is ready (and clamped) at or above the cost', () => {
    const p = summonProgress(cost * 3, 500)
    expect(p.ready).toBe(true)
    expect(p.missing).toBe(0)
    expect(p.toPct).toBe(1)
    expect(p.fromPct).toBe(1)
  })
  it('never goes below zero', () => {
    expect(summonProgress(100, 400).fromPct).toBe(0)
  })
})

describe('nextTeaser', () => {
  const s = createAccount(9)
  it('names the doors on offer', () => {
    const st = atFloor(s, { doors: [{ kind: 'path', reward: 'gold' }, { kind: 'elite', reward: 'boon' }] })
    expect(nextTeaser(st)).toBe('Next: Floor 6. Choose your door: ⚔ Path or 💀 Skull.')
  })
  it('points at a pending Boon or event first', () => {
    expect(nextTeaser(atFloor(s, { event: { kind: 'boon', floor: 5, options: ['volley'] } }))).toBe('Next: choose a Boon, then Floor 6.')
    expect(nextTeaser(atFloor(s, { event: { kind: 'bonus', floor: 5, options: ['rest'] } }))).toBe('Next: an event floor, then Floor 6.')
  })
  it('counts down to the guardian floor', () => {
    expect(nextTeaser(atFloor(s, { currentFloor: 7 }))).toBe('Next: Floor 7 · ⚔ Path. Guardian floor in 3.')
    expect(nextTeaser(atFloor(s, { currentFloor: 9 }))).toBe('Next: Floor 9 · ⚔ Path. The guardian floor is right after.')
  })
  it('names an anchor floor and the kind the climb set', () => {
    expect(nextTeaser(atFloor(s, { currentFloor: 10 }))).toMatch(/^Next: Floor 10, .+\. A guardian floor\.$/)
    expect(nextTeaser(atFloor(s, { currentFloor: 6, kind: 'elite' }))).toBe('Next: Floor 6 · 💀 Elite. Guardian floor in 4.')
  })
  it('is null past the top of the tower', () => {
    expect(nextTeaser(atFloor(s, { currentFloor: TUNING.tower.sliceTopFloor + 1 }))).toBeNull()
  })
})

describe('materials', () => {
  it('labels known materials and attribute stones', () => {
    expect(materialLabel('promotionStone')).toBe('🪨 Stone')
    expect(materialLabel('attrStone_fire')).toMatch(/^🔹 .+ stone$/)
    expect(materialLabel('mystery')).toBe('mystery')
  })
  it('lists drops largest first, dropping zeros', () => {
    const r = fixtureResult(log, { materialsAwarded: { rankMaterial: 1, promotionStone: 3, attrStone_water: 0 } })
    expect(materialRows(r).map((m) => [m.id, m.n])).toEqual([
      ['promotionStone', 3],
      ['rankMaterial', 1],
    ])
  })
})

describe('sweepMode (S6)', () => {
  const won = (over: Partial<FloorResult> = {}) => fixtureResult(log, { floor: 6, ...over })
  it('sweeps a Safe or Breather floor won with nobody lost', () => {
    expect(sweepMode({ report: { threat: 'safe', kind: 'path' }, result: won(), autoSweep: true })).toBe('highlights')
    expect(sweepMode({ report: { threat: 'fair', kind: 'breather' }, result: won(), autoSweep: true })).toBe('highlights')
    expect(sweepMode({ report: { threat: 'risky', kind: 'path' }, result: won({ kind: 'breather' }), autoSweep: true })).toBe('highlights')
  })
  it('never sweeps a fight in which a hero died', () => {
    expect(sweepMode({ report: { threat: 'safe', kind: 'path' }, result: won({ fallenHeroIds: ['h_a' as HeroId] }), autoSweep: true })).toBe('full')
  })
  it('respects the preference, a loss, and harder floors', () => {
    expect(sweepMode({ report: { threat: 'safe', kind: 'path' }, result: won(), autoSweep: false })).toBe('full')
    expect(sweepMode({ report: { threat: 'safe', kind: 'path' }, result: won({ cleared: false }), autoSweep: true })).toBe('full')
    expect(sweepMode({ report: { threat: 'fair', kind: 'path' }, result: won(), autoSweep: true })).toBe('full')
    expect(sweepMode({ report: null, result: won(), autoSweep: true })).toBe('full')
  })
  it('never sweeps tutorial floors, guardian floors or a revenge', () => {
    expect(sweepMode({ report: { threat: 'safe', kind: 'tutorial' }, result: won({ floor: 1 }), autoSweep: true })).toBe('full')
    expect(sweepMode({ report: { threat: 'safe', kind: 'boss' }, result: won({ floor: 10 }), autoSweep: true })).toBe('full')
    expect(sweepMode({ report: { threat: 'safe', kind: 'path' }, result: won({ nemesisDefeated: ['n1'] }), autoSweep: true })).toBe('full')
  })
})

describe('sortie helpers (S15)', () => {
  it('grows the streak by 10% a floor, capped at 50%', () => {
    expect([0, 1, 2, 5, 9].map(streakPct)).toEqual([0, 0.1, 0.2, 0.5, 0.5])
  })
  it('keeps half the purse on a rout', () => {
    expect(keptOnRout(1001)).toBe(Math.round(1001 * TUNING.climb.sortie.keepOnRout))
  })
  it('knows when a sortie is underway', () => {
    expect(sortieActive(null)).toBe(false)
    expect(sortieActive({ startFloor: 3, floors: 1, purse: 0, boons: [] })).toBe(true)
  })
})

describe('doorOutcome', () => {
  it('reports what a Cache or Rest gave', () => {
    const s = createAccount(4)
    const id = Object.keys(s.heroes)[0]! as HeroId
    const h = s.heroes[id]!
    const cache = { ...s, gold: s.gold + 720, materials: { ...s.materials, promotionStone: (s.materials.promotionStone ?? 0) + 1 } }
    expect(doorOutcome(s, cache, 'cache')).toBe('A cache, unguarded. +720 gold · +1 Promotion Stone')
    const low = { ...s, heroes: { ...s.heroes, [id]: { ...h, sanity: 40 } } }
    const rested = { ...s, heroes: { ...s.heroes, [id]: { ...h, sanity: 70 } } }
    expect(doorOutcome(low, rested, 'rest')).toBe('The party rests. +30 Sanity')
    expect(doorOutcome(s, s, 'rest')).toBe('The party rests.')
    // The Rest stop also cooks a meal (WP3 adds it to the pantry): say so.
    const fed = { ...rested, life: { ...rested.life, pantry: low.life.pantry + 1 } }
    expect(doorOutcome(low, fed, 'rest')).toBe('The party rests. +30 Sanity · +1 meal')
  })
})
