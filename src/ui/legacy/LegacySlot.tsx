import type { FloorResult, GameState } from '../../engine/types'
import type { Store } from '../../engine/store'

export interface LegacySlotProps {
  state: GameState
  /** Optional: ResultsScreen gets a store only when its host passes one. */
  store?: Store
  result: FloorResult
}

/**
 * Legacy slot on the results card (WP5 fills it: echoes to bequeath, nemesis news).
 * WP0 stub: renders nothing, so the results card is unchanged.
 */
export function LegacySlot(_props: LegacySlotProps): JSX.Element | null {
  return null
}
