/** Sorties: press on, or bank it (spec 2026-10-12 S15). */
import { describe, it, expect } from 'vitest'
import { newSortie, streakBonus, routBank, sortieAfterFloor, returnToCampus } from './sortie'
import { floorKindBase } from './kinds'
import { playFloor } from '../tower'
import { createAccount } from '../account'
import { reduce } from '../store'
import { suggestParty } from '../scout'
import { TUNING } from '../tuning'
import type { FloorResult, GameState, HeroId, OwnedHero, Sortie, TowerEvent } from '../types'

const S = TUNING.climb.sortie

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
  }
  return o
}

function roster(seed: number, n: number): GameState {
  let s: GameState = { ...createAccount(seed, { now: 0 }), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'SUMMON' })
  return reduce(s, { type: 'SET_PARTY', ...suggestParty(s) })
}

function gods(seed = 9): GameState {
  const s = roster(seed, 4)
  const heroes: Record<HeroId, OwnedHero> = {}
  for (const h of Object.values(s.heroes)) {
    heroes[h.id] = { ...h, star: 7, xp: { ...h.xp, level: 150 }, baseAttrs: { str: 999, agi: 999, vit: 999, int: 999, wil: 999 } }
  }
  return { ...s, heroes, gold: 0 }
}

function at(s: GameState, floor: number): GameState {
  return { ...s, tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1, doors: null, kind: floorKindBase(floor) } }
}

/** A minimal FloorResult for the bookkeeping (only the fields the Sortie reads). */
function result(floor: number, cleared: boolean, gold: number, outcome: FloorResult['result']['outcome'] = cleared ? 'win' : 'wipe', routed = false): FloorResult {
  return { floor, cleared, goldAwarded: gold, routed, result: { outcome } } as unknown as FloorResult
}

describe('purse math', () => {
  it('a streak adds perFloor × streak of the floor’s gold, capped', () => {
    expect(streakBonus(1000, 1)).toBe(Math.round(1000 * S.streakPctPerFloor))
    expect(streakBonus(1000, 3)).toBe(Math.round(1000 * S.streakPctPerFloor * 3))
    expect(streakBonus(1000, 50)).toBe(Math.round(1000 * S.streakCap))
    expect(streakBonus(0, 4)).toBe(0)
    expect(streakBonus(1000, 0)).toBe(0)
  })

  it('a rout or wipe keeps `keepOnRout` of the Purse', () => {
    expect(routBank({ ...newSortie(3), purse: 801 })).toBe(Math.round(801 * S.keepOnRout))
    expect(routBank(null)).toBe(0)
  })
})

describe('sortieAfterFloor', () => {
  const base = deepFreeze(createAccount(1, { now: 0 }))

  it('starts a Sortie on the first attempt from campus and grows the Purse on every clear', () => {
    let s: GameState = base
    let purse = 0
    for (let i = 1; i <= 7; i++) {
      const out = sortieAfterFloor(s, result(3 + i, true, 500))
      const bonus = streakBonus(500, i)
      purse += bonus
      expect(out.result.sortieBonus).toBe(bonus)
      expect(out.state.tower.sortie).toEqual({ startFloor: 4, floors: i, purse, boons: [] })
      // Base gold is never touched here: the Purse is only the at-risk bonus.
      expect(out.state.gold).toBe(base.gold)
      s = out.state
    }
  })

  it('a rout or a wipe banks half the Purse and ends the Sortie (and its Boons)', () => {
    const sortie: Sortie = { startFloor: 3, floors: 4, purse: 900, boons: ['volley'] }
    const s = { ...base, tower: { ...base.tower, sortie } }
    for (const r of [result(7, false, 0, 'retreat', true), result(7, false, 0, 'wipe'), result(7, false, 0, 'failed')]) {
      const out = sortieAfterFloor(s, r)
      expect(out.state.tower.sortie).toBeNull()
      expect(out.state.gold).toBe(base.gold + Math.round(900 * S.keepOnRout))
    }
  })

  it('a retreat the Master ordered is a choice, not a collapse: the Sortie carries on', () => {
    const sortie: Sortie = { startFloor: 3, floors: 4, purse: 900, boons: ['volley'] }
    const s = { ...base, tower: { ...base.tower, sortie } }
    const out = sortieAfterFloor(s, result(7, false, 0, 'retreat', false))
    expect(out.state.tower.sortie).toEqual(sortie)
    expect(out.state.gold).toBe(base.gold)
  })
})

describe('RETURN_TO_CAMPUS', () => {
  const base = createAccount(2, { now: 0 })

  it('banks the whole Purse, ends the Sortie and drops an open Boon choice', () => {
    const boon: TowerEvent = { kind: 'boon', floor: 9, options: ['volley', 'warChest', 'ironVow'] }
    const s = deepFreeze({ ...base, tower: { ...base.tower, sortie: { startFloor: 3, floors: 6, purse: 1234, boons: ['calmMind'] }, event: boon } })
    const home = returnToCampus(s)
    expect(home.gold).toBe(base.gold + 1234)
    expect(home.tower.sortie).toBeNull()
    expect(home.tower.event).toBeNull()
    // Through the store, too.
    expect(reduce(s, { type: 'RETURN_TO_CAMPUS' }).gold).toBe(base.gold + 1234)
  })

  it('keeps any other open event, and is the identity on campus', () => {
    const bonus: TowerEvent = { kind: 'bonus', floor: 10, options: ['rest'] }
    const s = { ...base, tower: { ...base.tower, sortie: newSortie(3), event: bonus } }
    expect(returnToCampus(s).tower.event).toEqual(bonus)
    expect(returnToCampus(base)).toBe(base)
  })
})

describe('Sorties in the climb', () => {
  it('a run of clears fills the Purse; returning to campus banks it', () => {
    let s = at(gods(), 3)
    let bonus = 0
    for (let f = 3; f <= 9; f++) {
      const { state, result } = playFloor(s)
      expect(result.cleared).toBe(true)
      bonus += result.sortieBonus ?? 0
      s = state
      while (s.tower.event) s = reduce(s, { type: 'RESOLVE_EVENT', option: s.tower.event.options.includes('rest') ? 'rest' : s.tower.event.options[0]! })
    }
    expect(s.tower.sortie?.floors).toBe(7)
    expect(s.tower.sortie?.purse).toBe(bonus)
    expect(bonus).toBeGreaterThan(0)
    const gold = s.gold
    expect(reduce(s, { type: 'RETURN_TO_CAMPUS' }).gold).toBe(gold + bonus)
  })
})
