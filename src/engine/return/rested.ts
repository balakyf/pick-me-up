/**
 * Pent-up Interference: absence gives instead of taking (spec 2026-10-12 S24).
 * Owner: WP6 (accrual), WP3 (consumption). Values live in `TUNING.return.rested`.
 *
 * `consumeRested` was built by WP0 (shared by WP3 and WP6); `accrueRested` (WP6) turns
 * time into charges. Every elapsed world-ms counts, whether the tab was closed, hidden or
 * open: the cap (`maxCharges`) is what makes absence matter, and nothing ever decays.
 */
import { TUNING } from '../tuning'
import type { MetaState } from '../types'

const RS = TUNING.return.rested

/** One real hour, in world-ms. */
const REAL_HOUR_WORLD = 3_600_000 * TUNING.time.worldTimeFactor

/** World-ms of time that builds one Interference charge (`perRealHours` real hours). */
export function restedChargeWorld(): number {
  return RS.perRealHours * REAL_HOUR_WORLD
}

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

/**
 * Turn `gapWorld` world-ms of elapsed time into charges: 1 per `perRealHours` real hours,
 * capped at `maxCharges`, the remainder kept in `carryWorld` so short gaps add up. At the
 * cap the carry is dropped (nothing banks past a full meter). PURE: returns the same
 * `meta` when nothing changes.
 */
export function accrueRested(meta: MetaState, gapWorld: number): MetaState {
  if (!(gapWorld > 0)) return meta
  const cur = meta.rested ?? { charges: 0, carryWorld: 0 }
  if (cur.charges >= RS.maxCharges) {
    return cur.carryWorld === 0 && meta.rested ? meta : { ...meta, rested: { charges: cur.charges, carryWorld: 0 } }
  }
  const per = restedChargeWorld()
  const total = cur.carryWorld + gapWorld
  const gained = Math.floor(total / per)
  const charges = Math.min(RS.maxCharges, cur.charges + gained)
  const carryWorld = charges >= RS.maxCharges ? 0 : Math.round(total - gained * per)
  return { ...meta, rested: { charges, carryWorld } }
}

/** World-ms until the next charge builds, or null when the meter is full. PURE. */
export function nextRestedChargeIn(meta: MetaState): number | null {
  const cur = meta.rested ?? { charges: 0, carryWorld: 0 }
  if (cur.charges >= RS.maxCharges) return null
  return Math.max(0, restedChargeWorld() - cur.carryWorld)
}
