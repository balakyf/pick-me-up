/**
 * Floor kinds and the floor budget (spec 2026-10-12 S13). Owner: WP3.
 *
 * WP0 contract: `floorKindBase` is implemented; `staticBudget` / `floorBudget` return
 * today's `floorPower(f, worldMult)` (no kind multiplier, no director) so nothing moves
 * until WP3 fills them in; `mercyBand` reads `TUNING.climb.mercyBand`.
 */
import { TUNING } from '../tuning'
import { floorPower } from '../tower/tower'
import type { FloorKind, GameState } from '../types'

/** The kind a floor has before any Door is chosen: F1-F2 tutorial, every 5th a boss, else Path. */
export function floorKindBase(f: number): FloorKind {
  if (f <= 2) return 'tutorial'
  if (f % 5 === 0) return 'boss'
  return 'path'
}

/** The static (pre-director) budget of floor `f` for `kind`. WP0 stub: today's floorPower. */
export function staticBudget(state: GameState, f: number, kind: FloorKind): number {
  return floorPower(f, TUNING.tower.worldMult[state.worldGrade])
}

/** The budget a floor of `kind` is built to: static re-tune × kind, capped by the mercy
 *  director and the step cap. WP0 stub: today's floorPower. */
export function floorBudget(state: GameState, f: number, kind: FloorKind): number {
  return staticBudget(state, f, kind)
}

/** The director's mercy band for `kind`: budget ≤ rosterCp × mercyBand(kind). */
export function mercyBand(kind: FloorKind): number {
  return TUNING.climb.mercyBand[kind] ?? 1
}
