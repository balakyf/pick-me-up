/**
 * Pent-up Interference: absence gives instead of taking (spec 2026-10-12 S24).
 * Owner: WP6 (accrual), WP3 (consumption). Values live in `TUNING.return.rested`.
 *
 * `consumeRested` is FULLY implemented by WP0 (shared by WP3 and WP6); `accrueRested`
 * is a WP0 stub (identity).
 */
import { TUNING } from '../tuning'
import type { MetaState } from '../types'

const RS = TUNING.return.rested

/**
 * Spend one Interference charge on a floor clear's gold. PURE.
 * With a charge left and `gold > 0`: bonus = round(gold × (goldMult − 1)) and one charge
 * is used. Otherwise nothing changes (the same `meta` comes back) and the bonus is 0.
 */
export function consumeRested(meta: MetaState, gold: number): { meta: MetaState; bonus: number } {
  const charges = meta.rested?.charges ?? 0
  if (charges <= 0 || gold <= 0) return { meta, bonus: 0 }
  const bonus = Math.round(gold * (RS.goldMult - 1))
  return { meta: { ...meta, rested: { ...meta.rested, charges: charges - 1 } }, bonus }
}

/** Turn `gapWorld` world-ms of absence into charges (1 per `perRealHours` real hours,
 *  capped at `maxCharges`, the remainder kept in `carryWorld`). PURE. WP0 stub: identity. */
export function accrueRested(meta: MetaState, gapWorld: number): MetaState {
  return meta
}
