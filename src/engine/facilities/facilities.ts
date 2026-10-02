/**
 * Layer 3 §3.1 — facility upgrades on the Master-Level spine.
 *
 * Facilities (Kitchen, Promotion Chamber, Tactical Center) upgrade by paying gold
 * (base × growth^level) and waiting out a world-time timer that completes in
 * `time.advanceTime` (or is gem-skipped). A higher level feeds the effects ALREADY
 * wired elsewhere — Kitchen → Sanity regen, Promotion Chamber → promotion timer,
 * Tactical Center → focus/overlook — so this module only owns cost, timer, gating,
 * and the level bump.
 *
 * Gating: a facility may not exceed the current Master Level (level ≤ masterLevel),
 * nor the hard slice cap; a gated facility's first build (0 → 1) additionally requires
 * its `unlockMasterLevel` (Promotion Chamber ML3, Training Center ML2).
 * Pure/deterministic — no RNG.
 */

import { TUNING } from '../tuning'
import { addMasterXp } from '../master'
import type { GameState, FacilityId } from '../types'

const F = TUNING.lobby.facilities
const MASTER = TUNING.lobby.master

/** Gold to upgrade a facility FROM `level` to `level + 1`. */
/** Master Level a facility's FIRST build (level 0 → 1) requires. Facilities not in the
 *  table (built from the start) are unrestricted. */
export function unlockMasterLevel(facility: FacilityId): number {
  return F.unlockMasterLevel[facility] ?? 1
}

export function upgradeCost(facility: FacilityId, level: number): number {
  // costGrowth^level as a multiply loop (no runtime `**` with a variable exponent — the
  // determinism guard; for 1.5 and these levels the product is exact, so costs are unchanged).
  let growth = 1
  for (let i = 0; i < level; i++) growth *= F.costGrowth
  return Math.round(F.baseCost[facility]! * growth)
}

/** World-time a build to `toLevel` takes (scales with the target level). */
export function upgradeDuration(toLevel: number): number {
  return F.durationPerLevel * toLevel
}

/**
 * Whether a facility can start upgrading right now: below the slice cap AND the
 * Master-Level ceiling (level < masterLevel), idle (no build in flight), the
 * first build of a gated facility cleared at its `unlockMasterLevel`, and the
 * gold cost affordable.
 */
export function canUpgrade(state: GameState, facility: FacilityId): boolean {
  const f = state.facilities[facility]
  if (f.build !== null) return false
  if (f.level >= F.maxLevel) return false
  if (f.level >= state.meta.masterLevel) return false
  if (f.level === 0 && state.meta.masterLevel < unlockMasterLevel(facility)) return false
  // Some facilities also wait on the world's Probability Interference (Layer 3 §D1).
  if (f.level === 0 && state.meta.pi < (TUNING.interference.unlock[facility] ?? 0)) return false
  return state.gold >= upgradeCost(facility, f.level)
}

/**
 * Begin a facility upgrade: validate the gate, charge gold, and set the build
 * timer. PURE — returns a fresh GameState. Throws when gated/unaffordable.
 */
export function startUpgrade(state: GameState, facility: FacilityId, nowWorld: number): GameState {
  if (!canUpgrade(state, facility)) {
    throw new Error(`startUpgrade: ${facility} cannot be upgraded now (gated, building, maxed, or unaffordable)`)
  }
  const f = state.facilities[facility]
  const toLevel = f.level + 1
  return {
    ...state,
    gold: state.gold - upgradeCost(facility, f.level),
    facilities: {
      ...state.facilities,
      [facility]: { level: f.level, build: { toLevel, completesAtWorld: nowWorld + upgradeDuration(toLevel) } },
    },
  }
}

/**
 * Resolve a completed build (shared by advanceTime's timer path and the gem-skip):
 * set the facility to its built level, clear the timer, and award facility-upgrade
 * Master XP. Assumes a build is present. PURE.
 */
export function completeFacilityBuild(state: GameState, facility: FacilityId): GameState {
  const f = state.facilities[facility]
  if (f.build === null) return state
  return {
    ...state,
    facilities: { ...state.facilities, [facility]: { level: f.build.toLevel, build: null } },
    meta: addMasterXp(state.meta, MASTER.xpPerFacilityUpgrade),
  }
}

/**
 * Gem pay-to-skip a facility build: charge `skipGemCost`, then complete it now.
 * PURE. Throws when no build is in flight or gems are insufficient.
 */
export function skipFacility(state: GameState, facility: FacilityId): GameState {
  const f = state.facilities[facility]
  if (f.build === null) throw new Error(`skipFacility: ${facility} has no build in flight`)
  if (state.gems < F.skipGemCost) {
    throw new Error(`skipFacility: insufficient gems (have ${state.gems}, need ${F.skipGemCost})`)
  }
  return completeFacilityBuild({ ...state, gems: state.gems - F.skipGemCost }, facility)
}
