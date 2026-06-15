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
import type { GameState, OwnedHero, HeroId } from '../types'

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
  for (const key of Object.keys(state.heroes) as HeroId[]) {
    const hero = state.heroes[key]!
    if (!hero.alive) {
      nextHeroes[key] = hero
      continue
    }
    let next: OwnedHero = { ...hero, sanity: clampSanity(hero.sanity + regen) }
    if (next.promotion !== null && next.promotion.completesAtWorld <= nowWorld) {
      next = completePromotion(next, state.seed)
    }
    nextHeroes[key] = next
  }

  return { ...state, heroes: nextHeroes, meta: { ...state.meta, lastSeenAtWorld: nowWorld } }
}
