/**
 * Doors: player-chosen risk for the next floor (spec 2026-10-12 S13). Owner: WP3.
 *
 * Randomness: stream `rngFor(state.seed, 'doors', floor)` only.
 * WP0 contract: `rollDoors` offers nothing (null); `chooseDoor` throws until built.
 */
import type { Door, GameState } from '../types'

/** The Doors offered for `nextFloor` after a clear; null = no choice (WP0 stub). */
export function rollDoors(state: GameState, nextFloor: number): Door[] | null {
  return null
}

/** CHOOSE_DOOR: take the `index`-th Door offered for the current floor. PURE; throws when refused. */
export function chooseDoor(state: GameState, index: number, nowWorld: number = 0): GameState {
  throw new Error('chooseDoor: not built yet')
}
