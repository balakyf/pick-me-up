/**
 * Layer 3 — the Kitchen facility (the Sanity faucet).
 *
 * Sanity is per-hero morale (0..sanityMax). It DRAINS in the tower (see
 * `tower.playFloor`) and is restored here. `banquet` is the Kitchen's interactive
 * action: spend gold once → bump every LIVING hero's Sanity, clamped to the max.
 *
 * PURE: never mutates its input; returns a fresh GameState. Dead heroes are left
 * untouched (no morale for the fallen). Throws if the account can't afford it —
 * the same insufficient-resource contract the gacha uses for gold.
 *
 * Later phases hang passive world-time regen (in `time.advanceTime`) and
 * Kitchen-level effects (faster regen, stronger banquets, a Sanity floor) off this
 * same module.
 */

import { TUNING } from '../tuning'
import type { GameState, OwnedHero, HeroId } from '../types'

const MAX = TUNING.lobby.sanityMax
const B = TUNING.lobby.banquet

/** Clamp a Sanity value into the valid [0, sanityMax] band. */
export function clampSanity(value: number): number {
  return Math.max(0, Math.min(MAX, value))
}

/**
 * Hold a Banquet: charge `banquet.gold` and raise every living hero's Sanity by
 * `banquet.restore` (clamped). Throws if `state.gold < banquet.gold`.
 */
export function banquet(state: GameState): GameState {
  if (state.gold < B.gold) {
    throw new Error(`banquet: insufficient gold (have ${state.gold}, need ${B.gold})`)
  }

  const nextHeroes: Record<HeroId, OwnedHero> = {}
  for (const key of Object.keys(state.heroes) as HeroId[]) {
    const hero = state.heroes[key]!
    nextHeroes[key] = hero.alive ? { ...hero, sanity: clampSanity(hero.sanity + B.restore) } : hero
  }

  return { ...state, gold: state.gold - B.gold, heroes: nextHeroes }
}

/** True when at least one living hero is below full Sanity (a Banquet would help). */
export function banquetWouldHelp(state: GameState): boolean {
  return (Object.values(state.heroes) as OwnedHero[]).some((h) => h.alive && h.sanity < MAX)
}
