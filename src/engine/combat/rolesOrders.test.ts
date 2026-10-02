/**
 * Lane F · roles through the whole floor: reduce(state, ATTEMPT_FLOOR) ≡ the UI's
 * attemptFloorWithResult (orders included) with heals, shields, taunts and statuses in
 * play, and a mid-battle order still replays the fight exactly up to its tick.
 */
import { describe, expect, it } from 'vitest'
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import { reduce, attemptFloorWithResult } from '../store'
import { prepareFloorBattle } from '../tower'
import { runBattle } from './combat'
import type { CombatEvent, GameState, HeroId } from '../types'

/** A party of ten summons, the first five deployed, each with a role kit. */
function rolesParty(floor: number): GameState {
  let s = { ...createAccount(11, { now: 0 }), gold: 1_000_000 }
  s = summonMany(s, 'normal', 10).state
  const ids = (Object.keys(s.heroes) as HeroId[]).slice(0, 5)
  const kits = [
    ['basic_shield', 'indomitability', 'power_strike'],
    ['first_aid', 'regeneration'],
    ['shadow_flurry', 'composure'],
    ['hunters_mark', 'thunder_volley'],
    ['war_cry', 'ganggyeok', 'berserk'],
  ]
  const heroes = { ...s.heroes }
  ids.forEach((id, i) => {
    heroes[id] = { ...heroes[id]!, skills: kits[i]!.map((k) => ({ id: k, level: 2, xp: 0 })) }
  })
  return {
    ...s,
    heroes,
    party: { slots: ids, lines: ['front', 'front', 'mid', 'back', 'back'] },
    tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1 },
  }
}

const roleEvents = (evs: CombatEvent[]) => evs.filter((e) => e.kind === 'status' || e.kind === 'dot' || e.kind === 'shield' || (e.kind === 'heal' && e.sourceId !== undefined))

describe('roles through reduce', () => {
  it('reduce ≡ attemptFloorWithResult, with and without orders, while the kit is in play', () => {
    for (const floor of [3, 8, 14]) {
      const s = rolesParty(floor)
      const plain = attemptFloorWithResult(s)
      expect(reduce(s, { type: 'ATTEMPT_FLOOR' })).toEqual(plain.state)
      expect(roleEvents(plain.result.result.log.events).length, `F${floor}`).toBeGreaterThan(0)
      const enemy = prepareFloorBattle(s).encounter.waves[0]!.units[0]!.id
      const ally = (s.party.slots as HeroId[])[3]!
      // One order a battle at this Tactical Center level: a focus, then (another attempt) a protect.
      for (const orders of [[{ tick: 4, kind: 'focus' as const, enemyId: enemy }], [{ tick: 6, kind: 'protect' as const, allyId: ally }]]) {
        expect(reduce(s, { type: 'ATTEMPT_FLOOR', orders })).toEqual(attemptFloorWithResult(s, undefined, undefined, undefined, orders).state)
      }
    }
  })

  it('an order replays the fight exactly up to its tick (statuses and all)', () => {
    const s = rolesParty(8)
    const p = prepareFloorBattle(s)
    const before = runBattle(p.battleUnits, p.encounter, p.combatSeed).log.events
    const at = 12
    const enemy = p.encounter.waves[0]!.units.at(-1)!.id
    const q = prepareFloorBattle(s, { orders: [{ tick: at, kind: 'focus', enemyId: enemy }] })
    const after = runBattle(q.battleUnits, q.encounter, q.combatSeed).log.events
    const upTo = (evs: CombatEvent[]) => evs.filter((e) => e.tick < at && e.kind !== 'end')
    expect(upTo(after)).toEqual(upTo(before))
  })
})
