/**
 * Probability Interference (Layer 3 §D1) — passive and account-wide; the player never
 * spends it. It is the world's stability: it rises while a Master plays (floor clears,
 * the daily login, the Hall of Magic's steady hum) and fades while the Master is away
 * (canon: "without a player a world risks vanishing"). Its thresholds unlock content
 * alongside Master Level ("more content unlocks via probability interference").
 *
 * PURE and DETERMINISTIC: no RNG; the decay is an integer-step multiply loop.
 */

import type { GameState, MetaState } from '../types'
import { TUNING } from '../tuning'

const PI = TUNING.interference
const WORLD_HOUR_MS = 3_600_000
const WORLD_DAY_MS = 24 * WORLD_HOUR_MS

/** Add PI (rounded to 0.01 to keep saves tidy). */
export function addPi(meta: MetaState, amount: number): MetaState {
  if (amount === 0) return meta
  return { ...meta, pi: Math.round((meta.pi + amount) * 100) / 100 }
}

/** Is content keyed `key` ('hallOfMagic' | 'crack') unlocked by PI? */
export function piUnlocked(state: GameState, key: string): boolean {
  return state.meta.pi >= (PI.unlock[key] ?? 0)
}

/** PI the Hall of Magic generates per world-hour at a level. */
export function hallRate(level: number): number {
  return PI.hallPerHourPerLevel * level
}

/**
 * The PI change across a world-time gap: the Hall of Magic's generation, then — if the
 * Master was away longer than `idleDays` — a fade of `decay` per further idle world-day.
 */
export function piAfterGap(pi: number, gapMs: number, hallLevel: number): number {
  let next = pi + hallRate(hallLevel) * (gapMs / WORLD_HOUR_MS)
  const idle = Math.floor(gapMs / WORLD_DAY_MS) - PI.idleDays
  for (let i = 0; i < idle; i++) next *= 1 - PI.decay
  return Math.round(next * 100) / 100
}
