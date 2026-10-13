/**
 * Test fixtures for the battle replay (WP2): real CombatLogs made by the engine, from a
 * fresh account after the free ten-pull and a suggested party, on any floor. Orders
 * re-resolve exactly the way TowerScreen does (attemptFloorWithResult from the same
 * pre-fight state), minus the store.
 */
import { createAccount } from '../../../engine/account'
import { attemptFloorWithResult, reduce } from '../../../engine/store'
import { suggestParty } from '../../../engine/scout'
import { ordersAllowed } from '../../../engine/tower'
import type { BattleOrder, CombatEvent, CombatLog, GameState } from '../../../engine/types'
import type { BattleOrders } from '../BattleScene'

const partyCache = new Map<number, GameState>()

/** A fresh account (seed) after the tutorial ten-pull, with the suggested party set. */
export function partyState(seed: number): GameState {
  const hit = partyCache.get(seed)
  if (hit) return hit
  let s = createAccount(seed)
  s = reduce(s, { type: 'SUMMON', count: 10 }, 0)
  const p = suggestParty(s)
  s = reduce(s, { type: 'SET_PARTY', slots: p.slots, lines: p.lines }, 0)
  partyCache.set(seed, s)
  return s
}

/** That party standing on `floor` (the tower's state otherwise untouched). */
export function atFloor(seed: number, floor: number): GameState {
  const s = partyState(seed)
  return { ...s, tower: { ...s.tower, currentFloor: floor } }
}

/** The CombatLog of attempting `floor` with that party. */
export function floorLog(seed: number, floor: number, orders: BattleOrder[] = []): CombatLog {
  return attemptFloorWithResult(atFloor(seed, floor), undefined, undefined, undefined, orders).result.result.log
}

/** BattleOrders that re-resolve like TowerScreen.fight does, recording every order given. */
export function ordersFor(pre: GameState): BattleOrders & { given: BattleOrder[] } {
  const given: BattleOrder[] = []
  return {
    left: ordersAllowed(pre),
    given,
    give: (order) => {
      try {
        const next = [...given, order]
        const r = attemptFloorWithResult(pre, undefined, undefined, undefined, next)
        given.push(order)
        return r.result.result.log
      } catch {
        return null
      }
    },
  }
}

/** Ids of the Master's heroes in a log (no NPCs, no foes). */
export function partyIdsOf(log: CombatLog): string[] {
  return log.unitsInit.filter((u) => u.side === 'hero' && !u.isNpc).map((u) => u.id)
}

/** Seeds and floors whose logs the tests sweep over. */
export const SEEDS = [1, 2, 3, 7, 11] as const

/** A CombatEvent without its seq (distributes over the union, unlike a bare Omit). */
export type EventSpec = CombatEvent extends infer E ? (E extends unknown ? Omit<E, 'seq'> : never) : never
