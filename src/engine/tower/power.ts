/**
 * The tower's static power curve: the floor budget and the enemy level. Split out of
 * tower.ts (spec 2026-10-12 WP3) so the climb director (`engine/climb`) can read it
 * without an import cycle; `tower.ts` re-exports everything here, so callers are unchanged.
 *
 * PURE and DETERMINISTIC: powerBase^f is a multiply loop (no Math.pow / `**`).
 */
import { TUNING } from '../tuning'

const T = TUNING.tower

/** powerBase^f via an integer-exponent MULTIPLY LOOP (no Math.pow / `**`). */
export function powLoop(base: number, exp: number): number {
  let acc = 1
  for (let i = 0; i < exp; i++) acc *= base
  return acc
}

/**
 * The floor's target combat-power budget (Layer 2 §3):
 *   floorPower(f) = base * powerBase^f * (1 + stepBonus*floor(f/5)) * earlyBoost(f) * worldMult.
 * The climb (engine/climb/kinds.ts) shapes this into the per-kind `floorBudget`; this raw
 * curve stays strictly increasing in f (powerBase > 1, stepBonus >= 0, worldMult > 0).
 */
export function floorPower(f: number, worldMult: number): number {
  const early = Math.min(f, T.inflectionFloor)
  const late = Math.max(0, f - T.inflectionFloor)
  // The early climb is budgeted up (tapering to nothing at the inflection), so the first
  // acts ask for a real party instead of falling in an afternoon.
  const boost = 1 + (T.earlyBudgetBoost * Math.max(0, T.inflectionFloor - f)) / T.inflectionFloor
  return (
    T.base *
    powLoop(T.powerBase, early) *
    powLoop(T.latePowerBase, late) *
    (1 + T.stepBonus * Math.floor(f / 5)) *
    boost *
    worldMult
  )
}

/**
 * The enemy level for filler/anchor mobs on a floor: round(f × perFloor × worldMult),
 * plus `inflectionLevelPerFloor` per floor past the F70 inflection (the curve steepens).
 */
export function mobLevel(f: number, worldMult: number): number {
  const inflection = Math.max(0, f - T.inflectionFloor) * T.inflectionLevelPerFloor
  // Canon: the difficulty "explodes" at the Wailing Wall (F80) and never comes back down.
  const wall = f >= T.wallFloor ? T.wallLevelBonus : 0
  return Math.round((f * T.mobLevelPerFloor + inflection + wall) * worldMult)
}
