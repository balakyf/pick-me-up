/**
 * WP3's climb numbers that are not in `TUNING.climb` yet (spec 2026-10-12 §4.0.2: only WP0
 * edits `engine/tuning.ts`). Owner: WP3.
 *
 * SHARED-FILE REQUEST (see docs/superpowers/plans/2026-10-12-fun-wp3-notes.md): at the
 * integration pass the lead moves these into `TUNING.climb` (as `climb.earlyLift` and new
 * `climb.mercyBand` values) and points kinds.ts at them; this file then goes away.
 * `TUNING.climb.kindMult` keeps its WP0 meaning (Path 1, Elite 1.45, Breather 0.6, Boss 1).
 */
import type { FloorKind } from '../types'

export const CLIMB_TUNE = {
  /** The early climb's lift over floorPower on a Path floor: ×earlyLift at the foot of the
   *  tower, fading quadratically to ×1 at the inflection floor (F70). The lift can't go
   *  into `tower.earlyBudgetBoost`: above ~4.2 it breaks floorPower's monotonicity near
   *  F69, and it would also move F1-F2 and the dailies. */
  earlyLift: 2.42,
  /** The mercy director's bands (replacing WP0's first-pass 0.8 / 1.0 / 0.95): a median
   *  roster meets a Path ratio of ~1.39 (Fair), and Skull and Boss floors stay a risk. */
  mercyBand: { tutorial: 1.0, breather: 0.5, path: 0.72, elite: 0.9, rest: 0, cache: 0, boss: 0.85 } as Readonly<Record<FloorKind, number>>,
} as const
