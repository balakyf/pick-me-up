/**
 * Test fixtures for the battle replay (WP2): real CombatLogs made by the engine, from a
 * fresh account after the free ten-pull and a suggested party, on any floor. Orders
 * re-resolve exactly the way TowerScreen does (attemptFloorWithResult from the same
 * pre-fight state), minus the store.
 *
 * The tests never hard-code "seed X, floor Y kills a hero": the climb's tuning (doors,
 * sawtooth, mercy director, rout) decides which fights are deadly, and it moves. Instead
 * each claim names the fight it needs as a predicate, and `findFight` searches seeds,
 * party sizes and floors deterministically for the first one that has it (a party cut
 * down to two or three heroes is the deliberately under-powered case, e.g. for a wipe).
 */
import { createAccount } from '../../../engine/account'
import { attemptFloorWithResult, reduce } from '../../../engine/store'
import { suggestParty } from '../../../engine/scout'
import { ordersAllowed } from '../../../engine/tower'
import type { BattleOrder, CombatEvent, CombatLog, GameState } from '../../../engine/types'
import type { BattleOrders } from '../BattleScene'
import { findDecisive, survives, type Decisive } from '../decisive'

const partyCache = new Map<string, GameState>()

/**
 * A fresh account (seed) after the tutorial ten-pull, with the suggested party set —
 * cut to its first `size` heroes (the rest of the slots left empty) when `size` < 5.
 */
export function partyState(seed: number, size = 5): GameState {
  const key = `${seed}|${size}`
  const hit = partyCache.get(key)
  if (hit) return hit
  let s = createAccount(seed)
  s = reduce(s, { type: 'SUMMON', count: 10 }, 0)
  const p = suggestParty(s)
  let kept = 0
  const slots = p.slots.map((id) => (id !== null && kept < size ? (kept++, id) : null))
  s = reduce(s, { type: 'SET_PARTY', slots, lines: p.lines }, 0)
  partyCache.set(key, s)
  return s
}

/** That party standing on `floor` (the tower's state otherwise untouched). */
export function atFloor(seed: number, floor: number, size = 5): GameState {
  const s = partyState(seed, size)
  return { ...s, tower: { ...s.tower, currentFloor: floor } }
}

/** The CombatLog of attempting `floor` with that party. */
export function floorLog(seed: number, floor: number, orders: BattleOrder[] = [], size = 5): CombatLog {
  return resolve(atFloor(seed, floor, size), orders)!
}

/** The fight re-resolved from `pre` with `orders` (null when the engine refuses them). */
export function resolve(pre: GameState, orders: BattleOrder[] = []): CombatLog | null {
  try {
    return attemptFloorWithResult(pre, undefined, undefined, undefined, orders).result.result.log
  } catch (err) {
    if (orders.length === 0) throw err
    return null
  }
}

/** BattleOrders that re-resolve like TowerScreen.fight does, recording every order given. */
export function ordersFor(pre: GameState): BattleOrders & { given: BattleOrder[] } {
  const given: BattleOrder[] = []
  return {
    left: ordersAllowed(pre),
    given,
    give: (order) => {
      const next = resolve(pre, [...given, order])
      if (next) given.push(order)
      return next
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

// ── Fights found by what they prove ─────────────────────────────────────────

/** A fixture fight: `size` of a seed's suggested heroes on `floor`, and its log. */
export interface Fight {
  seed: number
  floor: number
  size: number
  pre: GameState
  log: CombatLog
}

/** The floors and party sizes `findFight` searches (full parties first). */
export const SEARCH_FLOORS = 40
export const SEARCH_SIZES = [5, 4, 3, 2] as const

export function fightAt(seed: number, floor: number, size = 5): Fight {
  const pre = atFloor(seed, floor, size)
  return { seed, floor, size, pre, log: resolve(pre)! }
}

const found = new Map<string, Fight>()

/**
 * The first fight (by party size, then seed, then floor) for which `pred` holds. Pure and
 * deterministic, cached by `claim`. Throws, naming the claim, when no fight has it.
 */
export function findFight(
  claim: string,
  pred: (f: Fight) => boolean,
  { seeds = SEEDS, sizes = SEARCH_SIZES }: { seeds?: readonly number[]; sizes?: readonly number[] } = {},
): Fight {
  const key = `${claim}|${seeds.join(',')}|${sizes.join(',')}`
  const hit = found.get(key)
  if (hit) return hit
  for (const size of sizes)
    for (const seed of seeds)
      for (let floor = 1; floor <= SEARCH_FLOORS; floor++) {
        const f = fightAt(seed, floor, size)
        if (pred(f)) {
          found.set(key, f)
          return f
        }
      }
  throw new Error(`no fixture fight found: ${claim}`)
}

/** How many of the Master's heroes die in a log. */
export function partyDeaths(log: CombatLog): number {
  const ids = new Set(partyIdsOf(log))
  return log.events.filter((e) => e.kind === 'death' && ids.has(e.unitId)).length
}

/** The first Decisive Moment BattleScene would offer in a fight (null when no hero dies). */
export function decisiveOf(f: Fight): Decisive | null {
  return findDecisive(f.log, partyIdsOf(f.log))
}

/** The order the Decisive Moment card gives for `choice`. */
export function decisiveOrder(d: Decisive, choice: 'protect' | 'retreat'): BattleOrder {
  return choice === 'protect' ? { tick: d.orderTick, kind: 'protect', allyId: d.heroId } : { tick: d.orderTick, kind: 'retreat' }
}

/** Where BattleScene resumes a re-resolved log (the first event at or past the order's tick). */
export function resumeIndex(next: CombatLog, order: BattleOrder): number {
  const i = next.events.findIndex((e) => e.tick >= order.tick)
  return i < 0 ? 0 : i
}

/** A full party in which one of the Master's heroes dies (a Decisive Moment), for `seed` or any seed. */
export function deadlyFight(seed?: number): Fight {
  return findFight('a hero falls', (f) => decisiveOf(f) !== null, { seeds: seed === undefined ? SEEDS : [seed], sizes: [5] })
}

/** A won fight that cost a hero. */
export function costlyWin(): Fight {
  return findFight('a win that costs a hero', (f) => f.log.outcome === 'win' && partyDeaths(f.log) > 0)
}

/** A lost fight in which the whole party falls (DEFEAT), more than one hero with it. */
export function wipeFight(): Fight {
  return findFight('a wipe that takes several heroes', (f) => f.log.outcome === 'wipe' && partyDeaths(f.log) > 1 && decisiveOf(f) !== null)
}

/** A won fight with a death in which Protect at the Decisive Moment saves everyone and still wins. */
export function protectHolds(): Fight {
  return findFight('Protect holds and the fight is still won', (f) => {
    const d = f.log.outcome === 'win' ? decisiveOf(f) : null
    if (!d || ordersAllowed(f.pre) < 1) return false
    const next = resolve(f.pre, [decisiveOrder(d, 'protect')])
    return next !== null && next.outcome === 'win' && partyDeaths(next) === 0
  })
}

/** A fight in which Retreat at the Decisive Moment ends it and the doomed hero lives. */
export function retreatSaves(): Fight {
  return findFight('Retreat saves the doomed hero', (f) => {
    const d = decisiveOf(f)
    if (!d) return false
    const next = resolve(f.pre, [decisiveOrder(d, 'retreat')])
    return next !== null && next.outcome === 'retreat' && survives(next, d.heroId)
  })
}

/**
 * A fight with one order to give in which Protect at the first moment re-resolves into a
 * fight where a different hero is about to fall (the one re-arm).
 */
export function rearmFight(): Fight {
  return findFight('after Protect, another hero is doomed', (f) => {
    const d = decisiveOf(f)
    if (!d || ordersAllowed(f.pre) !== 1) return false
    const order = decisiveOrder(d, 'protect')
    const next = resolve(f.pre, [order])
    return next !== null && findDecisive(next, partyIdsOf(next), resumeIndex(next, order), [d.heroId]) !== null
  })
}

/**
 * A fight where Protect at the first moment, then Retreat at the second (another hero),
 * leaves both heroes standing: two rescues in one fight.
 */
export function twoRescues(): Fight {
  return findFight('Protect, then Retreat, saves two heroes', (f) => {
    const d1 = decisiveOf(f)
    if (!d1 || ordersAllowed(f.pre) < 1) return false
    const o1 = decisiveOrder(d1, 'protect')
    const log2 = resolve(f.pre, [o1])
    if (!log2) return false
    const d2 = findDecisive(log2, partyIdsOf(log2), resumeIndex(log2, o1), [d1.heroId])
    if (!d2) return false
    const log3 = resolve(f.pre, [o1, decisiveOrder(d2, 'retreat')])
    return log3 !== null && log3.outcome === 'retreat' && survives(log3, d1.heroId) && survives(log3, d2.heroId)
  })
}
