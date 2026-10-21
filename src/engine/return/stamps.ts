/**
 * The login stamp card: never resets, starts pre-stamped (spec 2026-10-12 S28).
 * Owner: WP6. Values live in `TUNING.return.stamps`.
 *
 * Replaces the old login streak (a missed world-day reset it — a quit trigger). Each
 * CLAIM_LOGIN on a new REAL day adds one stamp; every `perCard`-th stamp completes a card,
 * which pays `cardGems` gems and `cardPulls` free Normal pulls. The count only ever goes
 * up. The card starts at `endowed` stamps (endowed progress: 2/10, not 0/8).
 *
 * PURE and DETERMINISTIC: the "real day" comes from the caller-supplied world time.
 */
import { TUNING } from '../tuning'
import { summon } from '../gacha'
import type { GameState } from '../types'

const ST = TUNING.return.stamps
const REAL_DAY_WORLD = 24 * 3_600_000 * TUNING.time.worldTimeFactor

/** The real (Earth) day index of a world time: floor(nowWorld / (24h × worldTimeFactor)). */
export function realDayIndex(nowWorld: number): number {
  return Math.floor(nowWorld / REAL_DAY_WORLD)
}

/** Would a login claim at `nowWorld` add a stamp? (One per real day.) */
export function stampReady(state: GameState, nowWorld: number): boolean {
  return realDayIndex(nowWorld) > (state.meta.stamps?.lastRealDay ?? -1)
}

/** The card as the player sees it. */
export interface StampCardView {
  /** Stamps on the current card (0..perCard-1; a just-completed card reads 0). */
  onCard: number
  perCard: number
  /** Stamps until the next card pays out (1..perCard). */
  toNext: number
  /** Cards completed so far. */
  cardsDone: number
  /** Lifetime stamps. */
  count: number
}

export function stampCard(state: GameState): StampCardView {
  const count = state.meta.stamps?.count ?? ST.endowed
  const onCard = count % ST.perCard
  return { onCard, perCard: ST.perCard, toNext: ST.perCard - onCard, cardsDone: Math.floor(count / ST.perCard), count }
}

/**
 * Add today's stamp on CLAIM_LOGIN: one per real day; a claim on a day already stamped
 * changes nothing. The stamp that completes a card pays `cardGems` gems and performs
 * `cardPulls` free Normal summons (funded like the mercy pull, so gold is untouched).
 * PURE.
 */
export function stampOnLogin(state: GameState, nowWorld: number = 0): GameState {
  if (!stampReady(state, nowWorld)) return state
  const prev = state.meta.stamps ?? { count: ST.endowed, lastRealDay: -1 }
  const count = prev.count + 1
  let next: GameState = { ...state, meta: { ...state.meta, stamps: { count, lastRealDay: realDayIndex(nowWorld) } } }
  if (count % ST.perCard !== 0) return next
  next = { ...next, gems: next.gems + ST.cardGems }
  for (let i = 0; i < ST.cardPulls; i++) {
    const cost = TUNING.gacha.normalCostGold
    next = summon({ ...next, gold: next.gold + cost }).state
  }
  return next
}
