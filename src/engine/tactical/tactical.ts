/**
 * Layer 3 §3.4 — the Tactical Center facility.
 *
 * The Tactical Center AMPLIFIES the existing focus/overlook levers that already
 * flow into combat (it never gates them — baseline targeting works without it):
 *   - focus: a concentrate-fire damage bonus on the marked enemy (per level),
 *     passed into the Encounter and read in `combat`.
 *   - overlook: how many allies enemy targeting is steered off of (the slot count).
 *
 * Pure level→strength curves; combat reads the resulting numbers, not the facility.
 */

import { TUNING } from '../tuning'

const T = TUNING.lobby.tactical

/** Concentrate-fire damage bonus on the focused enemy at a Tactical Center level. */
export function tacticalFocusBonus(level: number): number {
  return T.focusBonusPerLevel * Math.max(0, level)
}

/** Overlook slots (how many allies can be shielded from enemy targeting) at a level. */
export function tacticalOverlookSlots(level: number): number {
  return T.overlookBaseSlots + Math.floor(Math.max(0, level) / 2)
}
