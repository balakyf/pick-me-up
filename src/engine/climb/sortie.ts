/**
 * Sorties: press on, or bank it (spec 2026-10-12 S15). Owner: WP3.
 *
 * A Sortie starts with the first floor attempted from campus. Each consecutive clear
 * adds a streak bonus — `streakPctPerFloor` of that floor's gold per floor in the streak,
 * capped at `streakCap` — to an at-risk Purse. Base floor gold is still paid at once; the
 * Purse is only the bonus on top. Returning to campus banks the whole Purse; a rout, a
 * wipe or any other lost fight banks only `keepOnRout` of it and ends the Sortie (and its
 * Boons). A retreat the Master ordered is a choice, not a collapse: the Sortie carries on.
 *
 * PURE: fresh objects only.
 */
import { TUNING } from '../tuning'
import type { FloorResult, GameState, Sortie } from '../types'

const S = TUNING.climb.sortie

/** A fresh Sortie starting at `floor`. */
export function newSortie(floor: number): Sortie {
  return { startFloor: floor, floors: 0, purse: 0, boons: [] }
}

/** The streak bonus a clear adds to the Purse: `gold` × min(cap, perFloor × streak). */
export function streakBonus(gold: number, streak: number): number {
  if (gold <= 0 || streak <= 0) return 0
  return Math.round(gold * Math.min(S.streakCap, S.streakPctPerFloor * streak))
}

/** What a broken Sortie (rout, wipe, lost fight) still banks from its Purse. */
export function routBank(sortie: Sortie | null): number {
  return sortie === null ? 0 : Math.round(sortie.purse * S.keepOnRout)
}

/** Did this attempt end in a retreat the Master ordered (not a rout)? */
function orderedRetreat(result: FloorResult): boolean {
  return result.result.outcome === 'retreat' && result.routed !== true
}

/**
 * Sortie bookkeeping after a floor attempt (called at the end of `playFloor`), on the
 * post-floor state whose `tower.sortie` is still the one the attempt started with:
 *   - no Sortie yet → one starts at this floor;
 *   - a clear → the streak grows and its bonus joins the Purse (`result.sortieBonus`);
 *   - an ordered retreat → nothing changes;
 *   - any other loss → `keepOnRout` of the Purse is banked into gold and the Sortie ends.
 * PURE.
 */
export function sortieAfterFloor(state: GameState, result: FloorResult): { state: GameState; result: FloorResult } {
  const cur = state.tower.sortie ?? newSortie(result.floor)
  if (result.cleared) {
    const floors = cur.floors + 1
    const bonus = streakBonus(result.goldAwarded, floors)
    const sortie: Sortie = { ...cur, floors, purse: cur.purse + bonus, boons: [...cur.boons] }
    return { state: { ...state, tower: { ...state.tower, sortie } }, result: { ...result, sortieBonus: bonus } }
  }
  if (orderedRetreat(result)) {
    const sortie: Sortie = { ...cur, boons: [...cur.boons] }
    return { state: { ...state, tower: { ...state.tower, sortie } }, result }
  }
  const banked = routBank(cur)
  return { state: { ...state, gold: state.gold + banked, tower: { ...state.tower, sortie: null } }, result }
}

/** RETURN_TO_CAMPUS: bank the whole Purse and end the Sortie (its Boons go with it, and a
 *  Boon choice still open is dropped). On campus already, nothing changes. PURE. */
export function returnToCampus(state: GameState, nowWorld: number = 0): GameState {
  const sortie = state.tower.sortie
  if (sortie === null) return state
  const event = state.tower.event?.kind === 'boon' ? null : state.tower.event
  return { ...state, gold: state.gold + sortie.purse, tower: { ...state.tower, sortie: null, event } }
}
