/**
 * The login stamp card: never resets, starts pre-stamped (spec 2026-10-12 S28).
 * Owner: WP6. Values live in `TUNING.return.stamps`.
 *
 * WP0 contract: `stampOnLogin` is identity.
 */
import type { GameState } from '../types'

/** Add today's stamp on CLAIM_LOGIN (one per real day; every `perCard`-th pays the card
 *  bonus). PURE. WP0 stub: identity. */
export function stampOnLogin(state: GameState, nowWorld: number = 0): GameState {
  return state
}
