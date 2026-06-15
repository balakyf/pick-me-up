/**
 * Layer 3 §3.1 — the Master Level spine.
 *
 * A separate progression track from hero levels. Master XP accrues from play
 * (floor clears, first-clears, completed promotions, facility upgrades) and levels
 * the account up along `masterXpToNext(L) = round(coeff × L^exp)`, stopping at the
 * cap. Master Level gates facility upgrade ceilings (level ≤ masterLevel) and the
 * Promotion Chamber build.
 *
 * Pure/deterministic — no RNG, no mutation.
 */

import { TUNING } from '../tuning'
import type { MetaState } from '../types'

const M = TUNING.lobby.master

/** Master XP needed to advance FROM level L to L+1. */
export function masterXpToNext(level: number): number {
  return Math.round(M.xpCoeff * level ** M.xpExp)
}

/**
 * Add Master XP, rolling through as many level-ups as the award covers and
 * carrying the remainder. Freezes at `cap` (overflow XP discarded, XP held at 0).
 * PURE — returns a fresh MetaState; unrelated fields are preserved.
 */
export function addMasterXp(meta: MetaState, amount: number): MetaState {
  let level = meta.masterLevel
  let xp = meta.masterXp + Math.max(0, amount)

  while (level < M.cap) {
    const need = masterXpToNext(level)
    if (xp < need) break
    xp -= need
    level += 1
  }

  if (level >= M.cap) {
    level = M.cap
    xp = 0 // capped: no further progress to track
  }

  return { ...meta, masterLevel: level, masterXp: xp }
}
