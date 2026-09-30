/**
 * Construction sites — which places on the campus still wait to be built, and why.
 *
 * Every facility the Master can raise has a room on the campus. Until its first build
 * completes (level 0) the room is a SITE: an empty lot with a timber frame instead of a
 * roof, a signpost where the building's counter will stand, and a marker overhead. This
 * module is the pure model behind that: one entry per facility, with the status the
 * marker, the Construction Board and the First Steps hint all read from.
 */
import type { FacilityId, GameState } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { canUpgrade, unlockMasterLevel, upgradeCost } from '../../engine/facilities'
import { synthesisUnlocked } from '../../engine/synthesis'
import { smithyUnlocked } from '../../engine/equipment'
import { dailyUnlocked } from '../../engine/daily'
import type { PlaceId, RoomId } from './lobbyMap'

/**
 * `ready` — can be built right now · `short` — everything but the gold ·
 * `locked` — waits on Master Level (or the world's Interference) · `building` — under way ·
 * `built` — standing (level ≥ 1).
 */
export type SiteStatus = 'ready' | 'short' | 'locked' | 'building' | 'built'

export interface Site {
  facility: FacilityId
  room: RoomId
  place: PlaceId
  label: string
  status: SiteStatus
  level: number
  /** Gold for the next build or upgrade (null when maxed). */
  cost: number | null
  /** Master Level the first build waits on (null when not gated by it). */
  unlockAt: number | null
  /** Probability Interference the first build waits on (null when not gated by it). */
  piNeeded: number | null
  /** World time the running build completes (null when idle). */
  completesAtWorld: number | null
  /** Target level of the running build (null when idle). */
  toLevel: number | null
}

/** Where each facility stands on the campus, in the Construction Board's order. */
export const FACILITY_SITES: { facility: FacilityId; room: RoomId; place: PlaceId; label: string }[] = [
  { facility: 'tavern', room: 'tavern', place: 'tavern', label: 'Tavern' },
  { facility: 'garden', room: 'garden', place: 'garden', label: 'Garden' },
  { facility: 'trainingCenter', room: 'training', place: 'trainingCenter', label: 'Training Center' },
  { facility: 'forge', room: 'armory', place: 'armory', label: 'Forge' },
  { facility: 'promotionChamber', room: 'promotionChamber', place: 'promotionChamber', label: 'Promotion Chamber' },
  { facility: 'infirmary', room: 'infirmary', place: 'infirmary', label: 'Infirmary' },
  { facility: 'transferStation', room: 'transfer', place: 'transferStation', label: 'Transfer Station' },
  { facility: 'market', room: 'market', place: 'market', label: 'Market' },
  { facility: 'library', room: 'library', place: 'library', label: 'Library' },
  { facility: 'watchtower', room: 'watchtower', place: 'watchtower', label: 'Watchtower' },
  { facility: 'hallOfMagic', room: 'magic', place: 'hallOfMagic', label: 'Hall of Magic' },
  { facility: 'kitchen', room: 'kitchen', place: 'kitchen', label: 'Kitchen' },
  { facility: 'tacticalCenter', room: 'tacticalCenter', place: 'tacticalCenter', label: 'Tactical Center' },
  { facility: 'dormitory', room: 'dormitory', place: 'dormitory', label: 'Dormitory' },
  { facility: 'memorial', room: 'memorial', place: 'memorial', label: 'Memorial' },
]

/** The status of one facility's site. */
export function siteOf(state: GameState, facility: FacilityId): Site {
  const where = FACILITY_SITES.find((s) => s.facility === facility)!
  const f = state.facilities[facility]
  const F = TUNING.lobby.facilities
  const gate = unlockMasterLevel(facility)
  const piGate = TUNING.interference.unlock[facility] ?? 0
  const maxed = f.level >= F.maxLevel
  const base = {
    ...where,
    level: f.level,
    cost: maxed ? null : upgradeCost(facility, f.level),
    unlockAt: f.level === 0 && gate > 1 ? gate : null,
    piNeeded: f.level === 0 && piGate > 0 ? piGate : null,
    completesAtWorld: f.build?.completesAtWorld ?? null,
    toLevel: f.build?.toLevel ?? null,
  }
  let status: SiteStatus
  if (f.build !== null) status = 'building'
  else if (f.level > 0) status = 'built'
  else if (canUpgrade(state, facility)) status = 'ready'
  else if (state.meta.masterLevel < gate || state.meta.pi < piGate || f.level >= state.meta.masterLevel) status = 'locked'
  else status = 'short'
  return { ...base, status }
}

/** Every facility's site, in board order. */
export function allSites(state: GameState): Site[] {
  return FACILITY_SITES.map((s) => siteOf(state, s.facility))
}

/** Sites not yet standing (level 0), in board order. */
export function unbuiltSites(state: GameState): Site[] {
  return allSites(state).filter((s) => s.status !== 'built')
}

/** How many builds or upgrades the Master could start this minute (the HUD badge). */
export function buildableCount(state: GameState): number {
  return allSites(state).filter((s) => canUpgrade(state, s.facility)).length
}

/** The room a facility's site occupies, if that room is still a site (level 0). */
export function siteRooms(state: GameState): Map<RoomId, Site> {
  const out = new Map<RoomId, Site>()
  for (const s of unbuiltSites(state)) if (!out.has(s.room)) out.set(s.room, s)
  return out
}

/**
 * Rooms dark for another reason than an unbuilt facility — the Synthesis Chamber and
 * the Smithy wait on Master Level, the Daily portal on the first clear. They get a
 * padlock, not a hammer: nothing can be built there.
 */
export function gatedRooms(state: GameState): { room: RoomId; place: PlaceId; label: string; reason: { key: string; n: number } }[] {
  const out: { room: RoomId; place: PlaceId; label: string; reason: { key: string; n: number } }[] = []
  if (!synthesisUnlocked(state))
    out.push({ room: 'synthesis', place: 'synthesis', label: 'Synthesis Chamber', reason: { key: 'Master Lv {n}', n: TUNING.lobby.synthesis.unlockMasterLevel } })
  if (!smithyUnlocked(state) && state.facilities.forge.level > 0)
    out.push({ room: 'armory', place: 'armory', label: 'Forge', reason: { key: 'Master Lv {n}', n: TUNING.lobby.equipment.unlockMasterLevel } })
  if (!dailyUnlocked(state))
    out.push({ room: 'daily', place: 'daily', label: 'Daily Dungeon', reason: { key: 'Clear Floor {n}', n: TUNING.lobby.daily.unlockHighestCleared } })
  return out
}
