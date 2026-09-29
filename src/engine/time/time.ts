/**
 * World-time: the engine's deterministic clock. The wall clock never enters the
 * engine — callers pass real epoch-ms in, and we scale it by the canon dilation.
 * advanceTime() is the pure catch-up the store runs before each command; in the
 * spine it only advances the high-water mark, and later phases hang timer
 * completion / Sanity regen / daily resets off it.
 */
import { TUNING } from '../tuning'
import { clampSanity } from '../kitchen'
import { completePromotion } from '../promotion'
import { worldDayIndex } from '../daily'
import { addMasterXp } from '../master'
import { completeTraining } from '../training'
import { piAfterGap, piZeroCrossing } from '../interference'
import { expeditionHaul } from '../rift'
import { resolveInvasions } from '../pvp'
import type { GameState, OwnedHero, HeroId, DailiesState, FacilityId } from '../types'

/** 1 world-hour in world-time ms. World-time is plain ms, only dilated at the edge. */
const WORLD_HOUR_MS = 3_600_000
const REGEN = TUNING.lobby.regen

/** Convert real epoch-ms to world-time ms (canon 3× dilation). Pure. */
export function toWorldTime(realMs: number): number {
  return realMs * TUNING.time.worldTimeFactor
}

/** Sanity recovered per WORLD-hour at a given Kitchen level (level 1 = base rate). */
export function sanityRegenRate(kitchenLevel: number): number {
  return REGEN.perWorldHour + REGEN.perKitchenLevel * Math.max(0, kitchenLevel - 1)
}

/**
 * Fast-forward the account to world-time `nowWorld`. Monotonic: never moves the
 * clock backward (a stale/smaller nowWorld is a no-op). Pure — returns the same
 * reference when nothing changes so existing reducers stay referentially stable.
 *
 * While catching up it (a) regenerates each LIVING hero's Sanity by
 * `sanityRegenRate(kitchenLevel) × elapsedWorldHours`, clamped to the max, and
 * (b) resolves any in-flight promotion whose `completesAtWorld` has elapsed —
 * seeded by the account seed, so an "offline" promotion replays identically. Dead
 * heroes are left untouched (no morale, no promotion, for the fallen). Deterministic
 * in (state, elapsed): the wall clock only enters via the caller-supplied nowWorld.
 */
export function advanceTime(state: GameState, nowWorld: number): GameState {
  if (nowWorld <= state.meta.lastSeenAtWorld) return state

  const hours = (nowWorld - state.meta.lastSeenAtWorld) / WORLD_HOUR_MS
  const regen = sanityRegenRate(state.facilities.kitchen.level) * hours

  const nextHeroes: Record<HeroId, OwnedHero> = {}
  let promotionsCompleted = 0
  let drillsCompleted = 0
  let gems = state.gems
  const materials = { ...state.materials }
  for (const key of Object.keys(state.heroes) as HeroId[]) {
    const hero = state.heroes[key]!
    if (!hero.alive) {
      nextHeroes[key] = hero
      continue
    }
    let next: OwnedHero = { ...hero, sanity: clampSanity(hero.sanity + regen) }
    if (next.promotion !== null && next.promotion.completesAtWorld <= nowWorld) {
      next = completePromotion(next, state.seed, state.tower.highestCleared)
      promotionsCompleted++
    }
    if (next.training !== null && next.training.completesAtWorld <= nowWorld) {
      next = completeTraining(next, state.facilities.trainingCenter.level)
      drillsCompleted++
    }
    // A Ruins expedition that has run its course comes home with its haul.
    if (next.expedition && next.expedition.completesAtWorld <= nowWorld) {
      const haul = expeditionHaul(next, state.seed)
      gems += haul.gems
      for (const [id, n] of Object.entries(haul.materials)) materials[id] = (materials[id] ?? 0) + n
      next = { ...next, expedition: null }
    }
    nextHeroes[key] = next
  }

  // Facility builds whose timer has elapsed complete now (level up, timer cleared).
  const nextFacilities = { ...state.facilities }
  let facilitiesCompleted = 0
  for (const fid of Object.keys(state.facilities) as FacilityId[]) {
    const f = state.facilities[fid]
    if (f.build !== null && f.build.completesAtWorld <= nowWorld) {
      nextFacilities[fid] = { level: f.build.toLevel, build: null }
      facilitiesCompleted++
    }
  }

  // Daily-Dungeon attempt counter resets on each world-day boundary.
  const today = worldDayIndex(nowWorld)
  const dailies: DailiesState =
    today > state.dailies.lastResetWorldDay
      ? { attemptsUsed: 0, lastResetWorldDay: today }
      : state.dailies

  // Completed promotions, facility upgrades and training drills feed the Master-Level spine.
  // Probability Interference: the Hall of Magic hums; a long absence lets the world fade.
  const pi = piAfterGap(state.meta.pi ?? 0, nowWorld - state.meta.lastSeenAtWorld, state.facilities.hallOfMagic?.level ?? 0)
  let meta = { ...state.meta, lastSeenAtWorld: nowWorld, pi }
  const masterGain =
    promotionsCompleted * TUNING.lobby.master.xpPerPromotion +
    facilitiesCompleted * TUNING.lobby.master.xpPerFacilityUpgrade +
    drillsCompleted * TUNING.lobby.master.xpPerTrainingDrill
  if (masterGain > 0) meta = addMasterXp(meta, masterGain)

  // The account lifecycle (Layer 4 §5.2): a world at zero Probability Interference greys,
  // and after six months (real) it is deleted — the canon grey towers.
  const L = TUNING.lifecycle
  const gap = nowWorld - state.meta.lastSeenAtWorld
  const crossing = piZeroCrossing(state.meta.pi ?? 0, gap, state.facilities.hallOfMagic?.level ?? 0, L.piZero)
  // The zero clock starts when PI FALLS to zero — a world that never had any isn't fading.
  const wasAlive = (state.meta.pi ?? 0) >= L.piZero
  const since =
    meta.pi < L.piZero
      ? (state.meta.piZeroSince ?? (wasAlive ? state.meta.lastSeenAtWorld + (crossing ?? 0) : null))
      : null
  meta = { ...meta, piZeroSince: since, deleted: state.meta.deleted || (since !== null && nowWorld - since >= L.deleteMs) }

  // Offline invasions through the open crack, and captive deadlines (Layer 4 §2).
  return resolveInvasions({ ...state, gems, materials, heroes: nextHeroes, facilities: nextFacilities, dailies, meta }, nowWorld)
}
