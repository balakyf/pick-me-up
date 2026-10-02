/**
 * The Master's orders 2.0 on the battle screen, pure: what an aim is waiting for, what a
 * click on a unit orders, how many orders are in hand (a cleared wave gives one back), and
 * where the heroes stand once two of them have swapped. BattleScene and OrderBar use these;
 * nothing here touches the DOM.
 */
import type { BattleOrder, CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { ORDERS } from '../../engine/combat/bossTuning'
import { wavesClearedBefore } from '../../engine/tactical/orders'

/** An order waiting for its target: a foe (Focus), a hero (Protect, Unleash), two heroes (Swap). */
export type Aim = 'focus' | 'protect' | 'unleash' | 'swap' | null

/** Which side an aim picks from. */
export function aimSide(aim: Aim): 'enemy' | 'hero' | null {
  if (aim === 'focus') return 'enemy'
  if (aim === 'protect' || aim === 'unleash' || aim === 'swap') return 'hero'
  return null
}

/** Can this unit take the aim? (Unleash and Swap are for the party's own heroes, never an escort.) */
export function aimable(aim: Aim, u: Pick<CombatUnitInit, 'side' | 'isNpc'>, dead: boolean, visible: boolean): boolean {
  if (aim === null || dead) return false
  if (aim === 'focus') return u.side === 'enemy' && visible
  if (aim === 'protect') return u.side === 'hero'
  return u.side === 'hero' && !u.isNpc
}

/** What a click on `u` while aiming gives: an order, the first hero of a swap, or nothing. */
export function clickOrder(
  aim: Aim,
  u: Pick<CombatUnitInit, 'id' | 'side' | 'isNpc'>,
  tick: number,
  swapFirst: string | null,
): { order: BattleOrder } | { swapFirst: string } | null {
  switch (aim) {
    case 'focus':
      return u.side === 'enemy' ? { order: { tick, kind: 'focus', enemyId: u.id } } : null
    case 'protect':
      return u.side === 'hero' ? { order: { tick, kind: 'protect', allyId: u.id } } : null
    case 'unleash':
      return u.side === 'hero' && !u.isNpc ? { order: { tick, kind: 'unleash', allyId: u.id } } : null
    case 'swap':
      if (u.side !== 'hero' || u.isNpc) return null
      if (swapFirst === null || swapFirst === u.id) return { swapFirst: u.id }
      return { order: { tick, kind: 'swap', a: swapFirst, b: u.id } }
    default:
      return null
  }
}

/** Orders in hand at `tick`: what the battle started with, plus a refill per wave cleared
 *  before it, less what was given since. */
export function ordersInHand(startLeft: number, given: number, log: Pick<CombatLog, 'events'>, tick: number): number {
  return Math.max(0, startLeft + (ORDERS.refillPerWave > 0 ? ORDERS.refillPerWave * wavesClearedBefore(log, tick) : 0) - given)
}

/** Has the party been told to Hold already (through the events played)? */
export function holdGiven(events: readonly CombatEvent[], applied: number): boolean {
  for (let i = 0; i < Math.min(applied, events.length); i++) {
    const e = events[i]!
    if (e.kind === 'order' && e.order.kind === 'hold') return true
  }
  return false
}

/**
 * Is the party bracing under the Master's Guard as of `applied` events? Read from the Guard
 * itself — the order (or, for a standing Guard, the first wind-up after it) and the run of
 * 'guard-up' statuses it raises at once, which say how long it holds — never from any
 * 'guard-up' (a knight's own Shield Wall is not the Master's Guard, and one hero's guard
 * wearing off does not end the party's).
 */
export function guardUp(events: readonly CombatEvent[], applied: number): boolean {
  const n = Math.min(applied, events.length)
  let until = -1
  let armed = false
  /** Inside the run of statuses a Guard raises. */
  let raising = false
  for (let i = 0; i < n; i++) {
    const e = events[i]!
    if (e.kind === 'order' && e.order.kind === 'guard') {
      if (e.order.onTelegraph) armed = true
      else {
        raising = true
        until = Math.max(until, e.tick + 1)
      }
      continue
    }
    if (e.kind === 'telegraph' && armed) {
      armed = false
      raising = true
      until = Math.max(until, e.tick + 1)
      continue
    }
    if (raising && e.kind === 'status' && e.status === 'guard-up') {
      until = Math.max(until, e.tick + e.ticks)
      continue
    }
    raising = false
  }
  const now = n > 0 ? events[n - 1]!.tick : 0
  return now < until
}

/** Where everyone stands after the swaps played so far (two heroes trade places). */
export function swappedPositions<P>(pos: Record<string, P>, events: readonly CombatEvent[], applied: number): Record<string, P> {
  let out = pos
  for (let i = 0; i < Math.min(applied, events.length); i++) {
    const e = events[i]!
    if (e.kind !== 'order' || e.order.kind !== 'swap') continue
    const { a, b } = e.order
    if (out[a] === undefined || out[b] === undefined) continue
    out = { ...out, [a]: out[b]!, [b]: out[a]! }
  }
  return out
}
