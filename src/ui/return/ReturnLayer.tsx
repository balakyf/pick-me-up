import type { GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import type { WorldView } from '../world/LobbyWorld'
import type { PlaceId } from '../world/lobbyMap'

export interface ReturnLayerProps {
  state: GameState
  store: Store
  /** The App's current view: the lobby or one of the full-screen scenes. */
  view: 'lobby' | WorldView
  /** Travel to a place (same handler as the Menu). */
  onGo: (place: PlaceId) => void
}

/**
 * The "welcome back" layer above the App (WP6 fills it: away summary, collect, stamps).
 * WP0 stub: renders nothing. It must never auto-open a window for a fresh `now: 0`
 * account or right after `load()` (smoke-test hygiene, spec §4.0.7).
 */
export function ReturnLayer(_props: ReturnLayerProps): JSX.Element | null {
  return null
}
