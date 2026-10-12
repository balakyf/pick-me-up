/**
 * Sorties: press on, or bank it (spec 2026-10-12 S15). Owner: WP3.
 *
 * WP0 contract: both functions are identity.
 */
import type { FloorResult, GameState } from '../types'

/** Sortie bookkeeping after a floor attempt (called in playFloor step 6): start the
 *  Sortie, grow the purse on a clear, bank `keepOnRout` and end it on a rout or wipe.
 *  May annotate `result.sortieBonus`. PURE. WP0 stub: identity. */
export function sortieAfterFloor(state: GameState, result: FloorResult): { state: GameState; result: FloorResult } {
  return { state, result }
}

/** RETURN_TO_CAMPUS: bank the purse and end the Sortie. PURE. WP0 stub: identity. */
export function returnToCampus(state: GameState, nowWorld: number = 0): GameState {
  return state
}
