/**
 * Progressive campus (spec 2026-10-12 S3): is a place open for this save?
 *
 * PURE. Reads the schedule in `TUNING.unlocks` (keys are the UI's PlaceIds; the engine
 * treats them as plain strings). A place opens at the FIRST of:
 *   - its floor: `tower.highestCleared >= floor`;
 *   - its Master Level: `meta.masterLevel >= masterLevel`;
 *   - its event, read straight from state:
 *       'firstDeath' — a grave in the Memorial (or any fallen hero on the roster);
 *       'firstGrief' — any hero grieving;
 *       'levelCap'   — any living hero at its level cap;
 *       'crackOpen'  — the Crack of Time and Space is open.
 * A place with no schedule entry (tower, summon, party, roster…) is always open.
 *
 * Owned by WP0 and FROZEN: the v10 → v11 migration backfills `life.unlocks` with this
 * exact predicate, and WP7's `ui/shell/unlocks.ts` wraps it.
 */
import { TUNING } from './tuning'
import type { GameState, OwnedHero } from './types'

export type UnlockRule = { floor?: number; masterLevel?: number; event?: string }

/** The schedule entry for a place, or null when it is always open. */
export function unlockRule(place: string): UnlockRule | null {
  return Object.prototype.hasOwnProperty.call(TUNING.unlocks, place) ? TUNING.unlocks[place] : null
}

/** Has the event that opens a place early happened in this save? Unknown events: no. */
export function unlockEventHappened(state: GameState, event: string): boolean {
  const heroes = Object.values(state.heroes) as OwnedHero[]
  switch (event) {
    case 'firstDeath':
      return (state.life?.memorial?.length ?? 0) > 0 || heroes.some((h) => !h.alive)
    case 'firstGrief':
      return heroes.some((h) => (h.life?.grief ?? 0) > 0)
    case 'levelCap':
      return heroes.some((h) => h.alive && h.xp.atCap)
    case 'crackOpen':
      return state.meta.crackOpen
    default:
      return false
  }
}

/** Is `place` open for this save? Places with no schedule entry are always open. */
export function isPlaceOpen(state: GameState, place: string): boolean {
  const rule = unlockRule(place)
  if (rule === null) return true
  if (rule.floor !== undefined && state.tower.highestCleared >= rule.floor) return true
  if (rule.masterLevel !== undefined && state.meta.masterLevel >= rule.masterLevel) return true
  if (rule.event !== undefined && unlockEventHappened(state, rule.event)) return true
  return false
}

/** Every scheduled place already open for this save (sorted). */
export function openScheduledPlaces(state: GameState): string[] {
  return Object.keys(TUNING.unlocks)
    .filter((p) => isPlaceOpen(state, p))
    .sort()
}
