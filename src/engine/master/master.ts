/**
 * Layer 3 §3.1 — the Master Level spine.
 *
 * A separate progression track from hero levels. Master XP accrues from play — floor
 * clears (more for higher floors and anchors), hidden objectives, completed promotions,
 * facility upgrades, drills, dailies, raids, the weekly trial, duels, bounties, job
 * tier-ups, statues, the tournament and PvP wins (TUNING.lobby.master) — and levels the
 * account up along a baked integer table (masterXpTable.ts), stopping at the cap. Master
 * Level gates facility ceilings (level ≤ masterLevel), the forge's grade, the half-Master
 * sight (truth hints), the Crack of Time and Space, PvP and the whale-bait reveal.
 *
 * Pure/deterministic — no RNG, no mutation, no runtime powers (B21).
 */

import { TUNING } from '../tuning'
import type { MetaState } from '../types'
import { MASTER_XP_TO_NEXT } from './masterXpTable'

const M = TUNING.lobby.master

/** Master XP needed to advance FROM level L to L+1 (the baked table; the last row past it). */
export function masterXpToNext(level: number): number {
  const i = Math.max(1, Math.min(Math.floor(level), MASTER_XP_TO_NEXT.length)) - 1
  return MASTER_XP_TO_NEXT[i]!
}

/** Total Master XP from level 1 to reach `level` (masterXpTotal(1) === 0). */
export function masterXpTotal(level: number): number {
  let total = 0
  for (let l = 1; l < level; l++) total += masterXpToNext(l)
  return total
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

/** Master XP a floor clear earns: every clear a little, a first clear more (and more the
 *  higher the floor), an anchor's first clear a good deal more. */
export function floorClearMasterXp(floor: number, firstClear: boolean): number {
  if (!firstClear) return M.xpPerFloorClear
  const anchor = floor % 5 === 0 ? M.xpAnchorFirstClearPerFloor * floor : 0
  return M.xpPerFloorClear + M.xpPerFirstClear + M.xpFirstClearPerFloor * floor + anchor
}
