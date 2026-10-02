/**
 * Lane G · orders 2.0 through the whole floor: every order kind keeps reduce(state,
 * ATTEMPT_FLOOR) ≡ the UI's attemptFloorWithResult; a cleared wave gives an order back; the
 * free pre-battle mark and Protects ride on the attempt's directive within the Tactical
 * Center's slots; the allowance arithmetic.
 */
import { describe, expect, it } from 'vitest'
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import { reduce, attemptFloorWithResult } from '../store'
import { ordersAllowed, prepareFloorBattle } from '../tower'
import { runBattle } from '../combat'
import type { BattleOrder, CombatEvent, GameState, HeroId } from '../types'
import { clampDirective, freeProtects, orderAllowance, ordersFit, ordersLeft, wavesClearedBefore } from './orders'
import { ORDERS } from '../combat/bossTuning'

/** Ten summons, the first five deployed with a kit that spends SP, at `floor`. */
function party(floor: number, seed = 11, level = 40): GameState {
  let s = { ...createAccount(seed, { now: 0 }), gold: 1_000_000 }
  s = summonMany(s, 'normal', 10).state
  const ids = (Object.keys(s.heroes) as HeroId[]).slice(0, 5)
  const kits = [['basic_shield', 'power_strike'], ['first_aid', 'arcane_burst'], ['shadow_flurry', 'spellbind'], ['hunters_mark', 'thunder_volley'], ['war_cry', 'ganggyeok']]
  const heroes = { ...s.heroes }
  ids.forEach((id, i) => {
    heroes[id] = { ...heroes[id]!, xp: { ...heroes[id]!.xp, level }, skills: kits[i]!.map((k) => ({ id: k, level: 3, xp: 0 })) }
  })
  return {
    ...s,
    heroes,
    party: { slots: ids, lines: ['front', 'front', 'mid', 'back', 'back'] },
    tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1 },
  }
}

const firstTick = (evs: CombatEvent[], kind: CombatEvent['kind']) => evs.find((e) => e.kind === kind)?.tick

describe('orders 2.0 through reduce', () => {
  it('every kind: reduce ≡ attemptFloorWithResult, and the order is in the log', () => {
    const s = party(20)
    const p = prepareFloorBattle(s)
    const log = runBattle(p.battleUnits, p.encounter, p.combatSeed).log
    const ids = s.party.slots as HeroId[]
    const t = Math.max(2, Math.floor((firstTick(log.events, 'end') ?? 20) / 3))
    const kinds: BattleOrder[] = [
      { tick: t, kind: 'unleash', allyId: ids[1]! },
      { tick: t, kind: 'guard' },
      { tick: 1, kind: 'guard', onTelegraph: true },
      { tick: t, kind: 'hold' },
      { tick: t, kind: 'swap', a: ids[0]!, b: ids[4]! },
      { tick: t, kind: 'focus', enemyId: p.encounter.waves[0]!.units[0]!.id },
      { tick: t, kind: 'protect', allyId: ids[3]! },
    ]
    for (const o of kinds) {
      const orders = [o]
      const ui = attemptFloorWithResult(s, undefined, undefined, undefined, orders)
      expect(reduce(s, { type: 'ATTEMPT_FLOOR', orders }), o.kind).toEqual(ui.state)
      expect(ui.result.result.log.events.some((e) => e.kind === 'order' && e.order.kind === o.kind)).toBe(true)
    }
  })

  it('a cleared wave gives an order back: a second order after it is accepted, before it refused', () => {
    const s = party(20)
    expect(ordersAllowed(s)).toBe(1)
    // The Master watches the fight as the first order made it, and gives the second after a wave falls.
    const hold: BattleOrder = { tick: 1, kind: 'hold' }
    const p = prepareFloorBattle(s, { orders: [hold] })
    const log = runBattle(p.battleUnits, p.encounter, p.combatSeed).log
    const cleared = log.events.find((e) => e.kind === 'mission' && e.code === 'wave-cleared')!
    expect(cleared).toBeDefined()
    const ids = s.party.slots as HeroId[]
    const after: BattleOrder[] = [
      { tick: 1, kind: 'hold' },
      { tick: cleared.tick + 1, kind: 'protect', allyId: ids[2]! },
    ]
    const ui = attemptFloorWithResult(s, undefined, undefined, undefined, after)
    expect(reduce(s, { type: 'ATTEMPT_FLOOR', orders: after })).toEqual(ui.state)
    if (ORDERS.refillPerWave > 0) {
      const before: BattleOrder[] = [
        { tick: 1, kind: 'hold' },
        { tick: 2, kind: 'protect', allyId: ids[2]! },
      ]
      expect(() => attemptFloorWithResult(s, undefined, undefined, undefined, before)).toThrow(/relay only/)
    }
  })

  it('the free pre-battle mark and Protects ride on the directive (clamped to the slots)', () => {
    const s = party(20)
    const ids = s.party.slots as HeroId[]
    const enemy = prepareFloorBattle(s).encounter.waves[0]!.units[1]!.id
    const focus = { focusEnemyId: enemy, overlookedAllyIds: [ids[3]!, ids[4]!, ids[2]!] }
    const ui = attemptFloorWithResult(s, focus)
    expect(reduce(s, { type: 'ATTEMPT_FLOOR', focus })).toEqual(ui.state)
    const enc = prepareFloorBattle(s, { focus }).encounter
    expect(enc.focus?.focusEnemyId).toBe(enemy)
    expect(enc.focus?.overlookedAllyIds).toEqual([ids[3]!, ids[4]!, ids[2]!].slice(0, freeProtects(s.facilities.tacticalCenter.level)))
    // A mark is free: it never counts against the orders.
    const orders: BattleOrder[] = [{ tick: 3, kind: 'guard' }]
    expect(() => attemptFloorWithResult(s, focus, undefined, undefined, orders)).not.toThrow()
  })
})

describe('the allowance', () => {
  const log = (ticks: number[]) => ({
    events: ticks.map((tick, seq) => ({ seq, tick, kind: 'mission' as const, note: '', code: 'wave-cleared' as const })),
  })

  it('counts the waves cleared before a tick', () => {
    expect(wavesClearedBefore(log([10, 30]), 10)).toBe(0)
    expect(wavesClearedBefore(log([10, 30]), 11)).toBe(1)
    expect(wavesClearedBefore(log([10, 30]), 31)).toBe(2)
    expect(orderAllowance(1, log([10]), 11, 1)).toBe(2)
    expect(orderAllowance(1, log([10]), 11, 0)).toBe(1)
  })

  it('orders fit when each was in hand at its tick; retreat is free', () => {
    const r = ORDERS.refillPerWave
    const l = log([10])
    expect(ordersFit(1, [{ tick: 3, kind: 'hold' }], l)).toBe(true)
    expect(ordersFit(1, [{ tick: 3, kind: 'hold' }, { tick: 4, kind: 'guard' }], l)).toBe(false)
    expect(ordersFit(1, [{ tick: 3, kind: 'hold' }, { tick: 12, kind: 'guard' }], l)).toBe(r > 0)
    expect(ordersFit(1, [{ tick: 3, kind: 'hold' }, { tick: 4, kind: 'retreat' }], l)).toBe(true)
    expect(ordersLeft(1, [{ tick: 3, kind: 'hold' }], l, 12)).toBe(r)
  })

  it('a directive keeps one mark and at most the slots’ Protects', () => {
    expect(clampDirective(undefined, 3)).toBeUndefined()
    expect(clampDirective({}, 3)).toBeUndefined()
    const many = { focusEnemyId: 'e', overlookedAllyIds: ['a', 'a', 'b', 'c', 'd', 'e'] }
    const out = clampDirective(many, 0)!
    expect(out.focusEnemyId).toBe('e')
    expect(out.overlookedAllyIds).toEqual(['a', 'b', 'c', 'd', 'e'].slice(0, freeProtects(0)))
    expect(clampDirective(many, 6)!.overlookedAllyIds!.length).toBe(Math.min(5, freeProtects(6)))
  })
})
