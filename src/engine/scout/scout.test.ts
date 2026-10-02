import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { createStore, reduce, attemptFloorWithResult } from '../store'
import { TUNING } from '../tuning'
import type { GameState } from '../types'
import { scoutFloor, suggestParty, threatFor, canFight } from '.'
import { ordersAllowed } from '../tower'

function roster(seed: number, n = 8): GameState {
  let s: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'SUMMON' })
  return s
}

describe('scouting', () => {
  it('reports the floor’s enemies and the party’s strength against the encounter built', () => {
    const s = roster(1)
    const r = scoutFloor(s)!
    expect(r.floor).toBe(1)
    expect(r.enemies.length).toBeGreaterThan(0)
    expect(r.enemies.reduce((n, e) => n + e.count, 0)).toBeGreaterThan(0)
    expect(r.partyCp).toBeGreaterThan(0)
    expect(r.budget).toBeGreaterThan(0)
  })

  it('threat bands read the forecast: wins and deaths, not a CP ratio', () => {
    expect(threatFor(100, 0)).toBe('safe')
    expect(threatFor(95, 0.3)).toBe('fair')
    expect(threatFor(80, 0.5)).toBe('fair')
    expect(threatFor(60, 0.5)).toBe('risky')
    expect(threatFor(100, 1)).toBe('risky')
    expect(threatFor(40, 0)).toBe('deadly')
    expect(threatFor(90, 2.4)).toBe('deadly')
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
