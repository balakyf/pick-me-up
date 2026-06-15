/**
 * World-time: the engine's deterministic clock. The wall clock never enters the
 * engine — callers pass real epoch-ms in, and we scale it by the canon dilation.
 * advanceTime() is the pure catch-up the store runs before each command; in the
 * spine it only advances the high-water mark, and later phases hang timer
 * completion / Sanity regen / daily resets off it.
 */
import { TUNING } from '../tuning'
import type { GameState } from '../types'

/** Convert real epoch-ms to world-time ms (canon 3× dilation). Pure. */
export function toWorldTime(realMs: number): number {
  return realMs * TUNING.time.worldTimeFactor
}

/**
 * Fast-forward the account to world-time `nowWorld`. Monotonic: never moves the
 * clock backward (a stale/smaller nowWorld is a no-op). Pure — returns the same
 * reference when nothing changes so existing reducers stay referentially stable.
 */
export function advanceTime(state: GameState, nowWorld: number): GameState {
  if (nowWorld <= state.meta.lastSeenAtWorld) return state
  return { ...state, meta: { ...state.meta, lastSeenAtWorld: nowWorld } }
}
