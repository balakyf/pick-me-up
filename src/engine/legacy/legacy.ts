/**
 * Legacy of the fallen: Echoes, New Arrivals and the Memorial's plaques (spec 2026-10-12
 * S21-S23). Owner: WP5. Values live in `TUNING.legacy`.
 *
 * Randomness: stream `rngFor(state.seed, 'nemesis', heroId)` only.
 * WP0 contract: the commands throw until built; the stat bonuses are neutral.
 */
import type { DerivedStats, GameState, HeroId, OwnedHero } from '../types'

/** BEQUEATH_ECHO: pass `fallenId`'s pending Echo to the living heir `heirId`. PURE; throws when refused. */
export function bequeathEcho(state: GameState, fallenId: HeroId, heirId: HeroId, nowWorld: number = 0): GameState {
  throw new Error('bequeathEcho: not built yet')
}

/** CLAIM_RECRUIT: spend a New Arrival token on a free Normal pull at minStar 2. PURE; throws when refused. */
export function claimRecruit(state: GameState, nowWorld: number = 0): GameState {
  throw new Error('claimRecruit: not built yet')
}

/** The Memorial's plaque bonus to every stat (fraction, capped). WP0 stub: 0. */
export function legacyPct(state: GameState): number {
  return 0
}

/** A hero's inherited Echoes as a relative stat map for `buildCombatUnit`'s `extraPct`.
 *  WP0 stub: {}. */
export function echoPct(hero: OwnedHero): Partial<Record<keyof DerivedStats, number>> {
  return {}
}
