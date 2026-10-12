/**
 * Boons: pick 1 of 3 after an Elite or Boss clear; they last the Sortie (spec 2026-10-12
 * S14). Owner: WP3. Values live in `TUNING.climb.boonValues`.
 *
 * Randomness: stream `rngFor(state.seed, 'boon', floor)` only.
 * WP0 contract: no boons yet (`BOONS` empty), no offer, units unchanged.
 */
import type { BoonId, CombatUnit, GameState } from '../types'

/** A Boon's display data; names and descriptions are English source strings for `t()`. */
export interface BoonDef {
  id: BoonId
  name: string
  description: string
}

/** Every Boon by id (WP0 stub: empty). */
export const BOONS: Readonly<Record<BoonId, BoonDef>> = {}

/** The Boon ids offered after clearing `floor` (WP0 stub: none). */
export function boonOffer(state: GameState, floor: number): BoonId[] {
  return []
}

/** Apply the Sortie's stat Boons to the deployed hero units, before battle. PURE.
 *  WP0 stub: identity (returns `units`). */
export function applyBoonsToUnits(state: GameState, units: CombatUnit[], boons: readonly BoonId[]): CombatUnit[] {
  return units
}
