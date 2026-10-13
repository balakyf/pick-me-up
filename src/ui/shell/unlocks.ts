/**
 * Progressive campus (spec 2026-10-12 S3), the UI side. The engine's frozen predicate
 * (`engine/unlocks.ts`, read from `TUNING.unlocks`) says whether a place is open; this
 * module turns that into what the shell shows: the Menu groups (Now / Campus / Next
 * unlock / Later), the player-facing condition ("Clear Floor 5, or when a hero
 * grieves"), progress toward it, and which places have opened but not had their fanfare.
 *
 * PURE apart from `t()` (the active locale). Locked places are never hidden or blocked:
 * they stay in the Menu and still open their panel as a preview.
 */
import { isPlaceOpen, unlockRule, type UnlockRule } from '../../engine/unlocks'
import type { GameState } from '../../engine/types'
import type { PlaceId } from '../world/lobbyMap'
import { t } from '../i18n/i18n'

/** The four doors open from minute one: the core loop. */
export const CORE_PLACES: readonly PlaceId[] = ['tower', 'summon', 'party', 'roster']

/** Order of the fast-travel menu (and of every list built from it). */
export const MENU_ORDER: readonly PlaceId[] = [
  'tower',
  'summon',
  'party',
  'roster',
  'kitchen',
  'tavern',
  'dormitory',
  'tacticalCenter',
  'promotionChamber',
  'trainingCenter',
  'armory',
  'transferStation',
  'synthesis',
  'library',
  'infirmary',
  'garden',
  'market',
  'watchtower',
  'memorial',
  'daily',
  'hallOfMagic',
  'rift',
  'guild',
  'shop',
]

export interface PlaceAccess {
  place: PlaceId
  open: boolean
  /** The schedule entry, or null for a place that is always open. */
  rule: UnlockRule | null
  /** The floor whose clear opens it (null when no floor opens it). */
  unlockAt: number | null
  /** Progress toward the main gate (floor or Master Level); null when always open. */
  progress: { cur: number; need: number } | null
  /** What opens it, for the player ("Clear Floor 5, or when a hero grieves"); null when open. */
  reason: string | null
}

const EVENT_TEXT: Record<string, string> = {
  firstDeath: 'or when a hero falls',
  firstGrief: 'or when a hero grieves',
  levelCap: 'or when a hero reaches the level cap',
  crackOpen: 'or when the Crack opens',
}

/** The condition that opens a place, in words (null for an always-open place). */
export function unlockCondition(rule: UnlockRule | null): string | null {
  if (rule === null) return null
  const main =
    rule.floor !== undefined
      ? t('Clear Floor {n}', { n: rule.floor })
      : rule.masterLevel !== undefined
        ? t('Reach Master Lv {n}', { n: rule.masterLevel })
        : null
  const alt = rule.event !== undefined && EVENT_TEXT[rule.event] ? t(EVENT_TEXT[rule.event]!) : null
  if (main && alt) return `${main}, ${alt}`
  return main ?? alt
}

/** The main gate alone, for tight spaces ("Floor 7", "Master Lv 20"); the event
 *  alternative, when it is the only way in. Null for an always-open place. */
export function shortCondition(rule: UnlockRule | null): string | null {
  if (rule === null) return null
  if (rule.floor !== undefined) return t('Floor {n}', { n: rule.floor })
  if (rule.masterLevel !== undefined) return t('Master Lv {n}', { n: rule.masterLevel })
  return unlockCondition(rule)
}

/** Is `place` open, and if not, what opens it and how close is the Master? */
export function placeAccess(state: GameState, place: PlaceId): PlaceAccess {
  const rule = unlockRule(place)
  const open = isPlaceOpen(state, place)
  let progress: PlaceAccess['progress'] = null
  if (rule?.floor !== undefined) progress = { cur: Math.min(state.tower.highestCleared, rule.floor), need: rule.floor }
  else if (rule?.masterLevel !== undefined)
    progress = { cur: Math.min(state.meta.masterLevel, rule.masterLevel), need: rule.masterLevel }
  return {
    place,
    open,
    rule,
    unlockAt: rule?.floor ?? null,
    progress,
    reason: open ? null : unlockCondition(rule),
  }
}

/** Every scheduled place open now, in menu order (the four core doors are not news). */
export function openPlaces(state: GameState): PlaceId[] {
  return MENU_ORDER.filter((p) => unlockRule(p) !== null && isPlaceOpen(state, p))
}

/** Every scheduled place still locked, in menu order. */
export function lockedPlaces(state: GameState): PlaceId[] {
  return MENU_ORDER.filter((p) => !isPlaceOpen(state, p))
}

/** How far a locked place is: floors still to clear (Master Levels count ×3, as a rough
 *  floor equivalent, so a floor gate always comes first when both are close). */
function distance(state: GameState, a: PlaceAccess): number {
  if (a.rule?.floor !== undefined) return a.rule.floor - state.tower.highestCleared
  if (a.rule?.masterLevel !== undefined) return 1000 + (a.rule.masterLevel - state.meta.masterLevel) * 3
  return Number.POSITIVE_INFINITY
}

export interface NextUnlock extends PlaceAccess {
  /** Other places that open at the same moment (menu order). */
  also: PlaceId[]
}

/** The closest locked place (ties broken by menu order), or null when all are open. */
export function nextUnlock(state: GameState): NextUnlock | null {
  const locked = lockedPlaces(state).map((p) => placeAccess(state, p))
  if (locked.length === 0) return null
  let best = locked[0]!
  for (const a of locked) if (distance(state, a) < distance(state, best)) best = a
  const also = locked
    .filter((a) => a.place !== best.place && a.unlockAt !== null && a.unlockAt === best.unlockAt)
    .map((a) => a.place)
  return { ...best, also }
}

/** Places open now whose "New facility!" fanfare has not been seen (menu order). */
export function unseenUnlocks(state: GameState): PlaceId[] {
  const seen = new Set(state.life.unlocks ?? [])
  return MENU_ORDER.filter((p) => unlockRule(p) !== null && !seen.has(p) && isPlaceOpen(state, p))
}

export interface MenuGroups {
  /** The four core doors. */
  now: PlaceId[]
  /** Scheduled places already open. */
  campus: PlaceId[]
  /** The one place that opens next (null when everything is open). */
  next: PlaceId | null
  /** Everything else still locked. */
  later: PlaceId[]
}

/** The Menu's groups. Every MENU_ORDER place appears exactly once. */
export function menuGroups(state: GameState): MenuGroups {
  const nu = nextUnlock(state)
  const now: PlaceId[] = []
  const campus: PlaceId[] = []
  const later: PlaceId[] = []
  for (const p of MENU_ORDER) {
    if (CORE_PLACES.includes(p)) now.push(p)
    else if (isPlaceOpen(state, p)) campus.push(p)
    else if (nu?.place !== p) later.push(p)
  }
  return { now, campus, next: nu?.place ?? null, later }
}

/** Isel's one sentence when a place opens: what it is good for, right now. */
const UNLOCK_LINE: Partial<Record<PlaceId, string>> = {
  kitchen: 'The Kitchen is yours. A cook feeds everyone better, and a good meal mends frayed nerves.',
  memorial: 'The Memorial is open. Every hero who falls gets a grave there, and the living will visit.',
  daily: 'The Daily Dungeon has opened: a new rift every world-day, full of stones for promotions.',
  tacticalCenter: 'The Tactical Center is open. Sharpen your Focus and Overlook orders there.',
  dormitory: 'The Dormitory is open. Every hero with a bed of their own sleeps better.',
  tavern: 'The Tavern is open. Heroes who drink together become friends… or rivals.',
  trainingCenter: 'The Training Center is open. Drills sharpen a hero’s skills while they wait.',
  garden: 'The Garden is open. A gardener grows food for the Kitchen and a little gold.',
  armory: 'The Forge is lit. A smith turns stones and gold into weapons and armour.',
  infirmary: 'The Infirmary is open. A healer mends broken nerves and heavy grief faster.',
  market: 'The Market is open. Merchants sell the campus’s surplus to other worlds.',
  promotionChamber: 'The Promotion Chamber is open. A hero at their cap can be raised a star higher.',
  synthesis: 'The Synthesis Chamber is open. Heroes go in… and something stronger comes out.',
  shop: 'My Gem Shop is open, Master. Look, do not touch… unless you want to.',
  library: 'The Library is open. Scholars study the floors ahead and reveal their weaknesses.',
  transferStation: 'The Transfer Station is open. A skill can leave one hero and settle in another.',
  watchtower: 'The Watchtower is open. Guards there see invaders coming.',
  guild: 'The Guild Hall is open. Other Masters, other wars. Choose your friends well.',
  hallOfMagic: 'The Hall of Magic is open. It measures this world’s Probability Interference.',
  rift: 'The Crack of Time has opened. Beyond it: the Ruins, and other Masters’ worlds.',
}

/** Isel's line for the unlock fanfare (translated). */
export function unlockLine(place: PlaceId): string {
  const line = UNLOCK_LINE[place]
  return line ? t(line) : t('A new place is open on campus, Master.')
}
