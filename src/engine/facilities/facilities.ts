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
 * nor the hard slice cap; the Promotion Chamber's first build (0 → 1) additionally
 * requires `chamberUnlockMasterLevel`. Pure/deterministic — no RNG.
 */

import { TUNING } from '../tuning'
import { addMasterXp } from '../master'
import type { GameState, FacilityId } from '../types'

const F = TUNING.lobby.facilities
const MASTER = TUNING.lobby.master

/** Gold to upgrade a facility FROM `level` to `level + 1`. */
export function upgradeCost(facility: FacilityId, level: number): number {
  return Math.round(F.baseCost[facility]! * F.costGrowth ** level)
}

/** World-time a build to `toLevel` takes (scales with the target level). */
export function upgradeDuration(toLevel: number): number {
  return F.durationPerLevel * toLevel
}

/**
 * Whether a facility can start upgrading right now: below the slice cap AND the
 * Master-Level ceiling (level < masterLevel), idle (no build in flight), the
 * Promotion Chamber's first build cleared at `chamberUnlockMasterLevel`, and the
 * gold cost affordable.
 */
export function canUpgrade(state: GameState, facility: FacilityId): boolean {
  const f = state.facilities[facility]
  if (f.build !== null) return false
  if (f.level >= F.maxLevel) return false
  if (f.level >= state.meta.masterLevel) return false
  if (facility === 'promotionChamber' && f.level === 0 && state.meta.masterLevel < F.chamberUnlockMasterLevel) {
    return false
  }
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
