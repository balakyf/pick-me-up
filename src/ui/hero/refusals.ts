/**
 * Why a place cannot take a hero right now, in the Master's words (lane N). The shared
 * hero picker greys a row out with this reason; each facility keeps its own rule and the
 * engine still refuses on its own (these only say it first). Pure.
 */
import type { GameState, OwnedHero } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { canAfford } from '../../engine/promotion'
import { estateBusy } from '../../engine/estate/deploy'

/** What keeps a hero from any facility work: away, held, or fallen. */
export function awayReason(state: GameState, h: OwnedHero): string | null {
  if (!h.alive) return 'Has fallen.'
  if (h.captiveOf) return 'Held by a rival Master.'
  if (h.expedition) return 'Away in the Ruins.'
  if (estateBusy(state, h.id) === 'is out on a bounty') return 'Out on a bounty.'
  return null
}

/** The Promotion Chamber: at the level cap, below the ceiling, free, and the stones paid. */
export function promoteRefusal(state: GameState, h: OwnedHero, checkCost = true): string | null {
  const away = awayReason(state, h)
  if (away) return away
  if (h.promotion !== null) return 'Already in the Promotion Chamber.'
  if (h.star >= TUNING.lobby.promotion.maxStar) return 'Already at the highest star.'
  if (h.training !== null) return 'In the middle of a drill.'
  if (!h.xp.atCap) return 'Not at their level cap yet.'
  if (checkCost && !canAfford(state, h)) return 'Not enough materials to promote.'
  return null
}

/** The Training Center's drills and the Transfer Station: home and not busy. */
export function busyRefusal(state: GameState, h: OwnedHero): string | null {
  const away = awayReason(state, h)
  if (away) return away
  if (h.promotion !== null) return 'In the Promotion Chamber.'
  if (h.training !== null) return 'In the middle of a drill.'
  return null
}

/** The Transfer Station: home and not busy, but a hero out on a bounty may still give or
 *  receive a skill (the station's engine rule has no bounty check). */
export function stationRefusal(state: GameState, h: OwnedHero): string | null {
  if (estateBusy(state, h.id) === 'is out on a bounty' && h.alive && !h.captiveOf && !h.expedition) {
    if (h.promotion !== null) return 'In the Promotion Chamber.'
    if (h.training !== null) return 'In the middle of a drill.'
    return null
  }
  return busyRefusal(state, h)
}

/** Synthesis: a sacrifice must be home, not promoting and not drilling (the chamber's own rule). */
export function sacrificeRefusal(state: GameState, h: OwnedHero, survivorId: string | null): string | null {
  if (h.id === survivorId) return 'The survivor cannot be a sacrifice.'
  return busyRefusal(state, h)
}
