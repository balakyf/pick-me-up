/**
 * Orders 2.0 (lane G): how many orders the Master's voice can carry in a battle, and the
 * free pre-battle levers the Tactical Center gives.
 *
 * - A battle starts with `allowed` orders (tower.ordersAllowed: one, plus one per two
 *   Tactical Center levels); each wave the party clears gives back ORDERS.refillPerWave.
 *   An order at tick t may spend what the waves cleared before t gave back. Retreat is
 *   always free.
 * - Before the fight the Master may MARK one foe (a focus from the first blow) and PROTECT
 *   up to `tacticalOverlookSlots(level)` heroes — both free (they ride on the attempt's
 *   FocusDirective, not on its orders).
 *
 * PURE. The engine validates with `ordersFit` (playFloor) and the battle screen counts with
 * `ordersLeft`, so the two always agree.
 */
import type { BattleOrder, CombatLog, FocusDirective } from '../types'
import { ORDERS } from '../combat/bossTuning'
import { tacticalOverlookSlots } from './tactical'

/** Does this order spend one of the battle's orders? (A retreat never does.) */
export function spendsOrder(o: BattleOrder): boolean {
  return o.kind !== 'retreat'
}

/** Waves the party had cleared before `tick` (the log's 'wave-cleared' beats). */
export function wavesClearedBefore(log: Pick<CombatLog, 'events'>, tick: number): number {
  let n = 0
  for (const e of log.events) {
    if (e.tick >= tick) break
    if (e.kind === 'mission' && e.code === 'wave-cleared') n++
  }
  return n
}

/** Orders the Master can give at `tick` in this fight, before any is spent. */
export function orderAllowance(allowed: number, log: Pick<CombatLog, 'events'>, tick: number, refill: number = ORDERS.refillPerWave): number {
  return allowed + (refill > 0 ? refill * wavesClearedBefore(log, tick) : 0)
}

/** Orders still in hand at `tick`, given the ones already spent. */
export function ordersLeft(allowed: number, given: readonly BattleOrder[], log: Pick<CombatLog, 'events'>, tick: number): number {
  return Math.max(0, orderAllowance(allowed, log, tick) - given.filter(spendsOrder).length)
}

/**
 * Do these orders fit the allowance, read against the battle they produced? The k-th
 * spending order (by tick) must be within what the waves cleared before its tick gave back.
 * (Combat is deterministic, so the log up to an order's tick is the log it was given on.)
 */
export function ordersFit(allowed: number, orders: readonly BattleOrder[], log: Pick<CombatLog, 'events'>): boolean {
  const spending = orders.filter(spendsOrder).sort((a, b) => a.tick - b.tick)
  return spending.every((o, k) => k + 1 <= orderAllowance(allowed, log, o.tick))
}

/** Free pre-battle Protects the Tactical Center allows at its level. */
export function freeProtects(level: number): number {
  return tacticalOverlookSlots(level)
}

/** A pre-battle directive within the Tactical Center's allowance (extra protects dropped). */
export function clampDirective(focus: FocusDirective | undefined, level: number): FocusDirective | undefined {
  if (focus === undefined) return undefined
  const protects = [...new Set(focus.overlookedAllyIds ?? [])].slice(0, freeProtects(level))
  const out: FocusDirective = {}
  if (focus.focusEnemyId !== undefined) out.focusEnemyId = focus.focusEnemyId
  if (protects.length > 0) out.overlookedAllyIds = protects
  return out.focusEnemyId !== undefined || out.overlookedAllyIds !== undefined ? out : undefined
}
