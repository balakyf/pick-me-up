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
 * Passive world-time regen lives in `time.advanceTime`; the low-Sanity COMBAT
 * effect (stat penalty + panic policy) lives here as pure helpers, applied at
 * unit assembly / inside the combat loop.
 */

import { TUNING } from '../tuning'
import { withFavor } from '../favor'
import type { GameState, OwnedHero, HeroId, DerivedStats } from '../types'

const MAX = TUNING.lobby.sanityMax
const B = TUNING.lobby.banquet
const SC = TUNING.lobby.combat

/** Clamp a Sanity value into the valid [0, sanityMax] band. */
export function clampSanity(value: number): number {
  return Math.max(0, Math.min(MAX, value))
}

/**
 * Combat stat multiplier for a hero's current Sanity (Layer 3 §3.2):
 *   ≥ minorThreshold → 1 (no penalty) · [major, minor) → minorMult · < major → majorMult.
 * Applied at unit assembly so the frozen snapshot combat reads is already weakened.
 */
export function sanityStatMult(sanity: number): number {
  if (sanity >= SC.minorThreshold) return 1
  if (sanity >= SC.majorThreshold) return SC.minorMult
  return SC.majorMult
}

/**
 * Scale a hero's MAGNITUDE stats (HP/atk/def/spd) by the Sanity multiplier,
 * rounding each. Percentage stats (crit/eva/acc/statusRes) are left untouched —
 * the penalty saps power, not precision. Returns the same reference at full
 * Sanity (multiplier 1) so existing callers stay referentially stable.
 */
export function applySanityPenalty(stats: DerivedStats, sanity: number): DerivedStats {
  const m = sanityStatMult(sanity)
  if (m === 1) return stats
  return {
    ...stats,
    maxHP: Math.round(stats.maxHP * m),
    pAtk: Math.round(stats.pAtk * m),
    mAtk: Math.round(stats.mAtk * m),
    pDef: Math.round(stats.pDef * m),
    mDef: Math.round(stats.mDef * m),
    spd: Math.round(stats.spd * m),
  }
}

/**
 * Panic chance for a hero about to act (Layer 3 §3.2): below `panicThreshold`,
 * probability `(panicThreshold − sanity)/100`, mitigated by the hero's statusRes.
 * Returns 0 at/above the threshold so a healthy hero never even rolls. Clamped to
 * [0, 1]. Pure — the combat loop feeds this into a seeded `chance` draw.
 */
export function panicChance(sanity: number, statusRes: number): number {
  if (sanity >= SC.panicThreshold) return 0
  const raw = ((SC.panicThreshold - sanity) / 100) * (1 - statusRes / 100)
  return Math.max(0, Math.min(1, raw))
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
    // A shared table also warms the roster to the Master a little (Layer 3 §C1).
    nextHeroes[key] = hero.alive
      ? withFavor({ ...hero, sanity: clampSanity(hero.sanity + B.restore) }, hero.favor + TUNING.favor.perBanquet)
      : hero
  }

  return { ...state, gold: state.gold - B.gold, heroes: nextHeroes }
}

/** True when at least one living hero is below full Sanity (a Banquet would help). */
export function banquetWouldHelp(state: GameState): boolean {
  return (Object.values(state.heroes) as OwnedHero[]).some((h) => h.alive && h.sanity < MAX)
}
