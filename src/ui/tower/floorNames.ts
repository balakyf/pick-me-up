/**
 * Names and mission icons for the seeded floors (UI-side, cosmetic): every filler floor gets
 * a deterministic name from its act's vocabulary — "Stair of Wolfsong", "Vault of Black
 * Glass" — instead of fifty rows of "Seeded floor". The name is a pure function of the
 * account seed and the floor (the Wailing Wall's are the same for every Master, like the
 * Wall itself). Anchors keep their own mission names.
 */
import { ACTS, ANCHORS, actForFloor } from '../../engine/content'
import { buildEncounter } from '../../engine/tower'
import type { GameState } from '../../engine/types'
import { hashString, seededRand } from '../pixel/rand'
import { t } from '../i18n/i18n'
import { POST_WALL_STORY } from '../../engine/content/story'

/** Shared architectural nouns (each act lends its own qualifiers). */
export const FLOOR_NOUNS = ['Stair', 'Hall', 'Gallery', 'Landing', 'Vault', 'Causeway', 'Terrace', 'Cloister'] as const

/** Per act: what its floors are "of". */
export const FLOOR_QUALIFIERS: Record<string, readonly string[]> = {
  prairie: ['of the Long Grass', 'of Wolfsong', "of the Harpy's Nest", 'of Burnt Fences', 'of the Shepherd', 'of the Last Mill'],
  ruins: ['of Broken Kings', 'of Dry Bones', 'of the Silent Bell', 'of Daggers', 'of the Fallen Banner', 'of Old Oaths'],
  swamp: ['of the Mire', 'of Green Water', 'of Scales', 'of the Sunken Path', 'of Reeds', 'of the Mud Giant'],
  coast: ['of Salt', 'of the Drowned', 'of Tides', 'of the Black Reef', 'of Foam', 'of Wrecks'],
  order: ['of Iron Vows', 'of the Order', 'of Marching Boots', 'of the Burning Seal', 'of Ash Banners', 'of the Watch'],
  inflection: ['of Twin Heads', 'of Wraithlight', 'of the Long Fall', 'of Teeth', 'of Red Stone', 'of Whispers'],
  wall: ['of Fragments', 'of the Wailing', 'of Black Glass', 'of the Shard', 'of Echoes', 'of the Breach'],
  void: ['of Nothing', 'of Blank Pages', 'of Grey Light', 'of the Last Step', 'of Silence', 'of the Abyss'],
}

/** The Wall's names ignore the account (the Fragment Series is the same for everyone). */
const WALL_SEED = 0x80_80

/** The (noun, qualifier) pair a seeded floor is named with, in English. Null for anchors. */
export function floorNameParts(accountSeed: number, floor: number): { noun: string; qualifier: string } | null {
  if (ANCHORS[floor] !== undefined) return null
  const act = actForFloor(floor)
  const quals = FLOOR_QUALIFIERS[act.id] ?? FLOOR_QUALIFIERS.void!
  // Every (noun, qualifier) pair of the act, shuffled once per account (per act), then dealt
  // to the act's filler floors in order — no two floors of an act share a name.
  const combos: { noun: string; qualifier: string }[] = []
  for (const q of quals) for (const n of FLOOR_NOUNS) combos.push({ noun: n, qualifier: q })
  const seed = act.id === 'wall' ? WALL_SEED : accountSeed
  const r = seededRand(hashString(`floor-names|${seed}|${act.id}`))
  for (let i = combos.length - 1; i > 0; i--) {
    const j = r.int(0, i)
    const tmp = combos[i]!
    combos[i] = combos[j]!
    combos[j] = tmp
  }
  let index = 0
  for (let f = act.from; f < floor; f++) if (ANCHORS[f] === undefined) index++
  return combos[index % combos.length]!
}

/** A seeded floor's name ("Stair of Wolfsong"), translated; null for an anchor. */
export function floorName(accountSeed: number, floor: number): string | null {
  // Lane O: the floors behind the Wall carry their story's own name ("The Breach Road").
  const story = POST_WALL_STORY[floor]
  if (story !== undefined && ANCHORS[floor] === undefined) return t(story.title)
  const p = floorNameParts(accountSeed, floor)
  return p ? `${t(p.noun)} ${t(p.qualifier)}` : null
}

/** An icon per mission type (anchors and the seeded mix). */
export const MISSION_ICON: Record<string, string> = {
  Subjugation: '⚔',
  Survival: '⏳',
  Escape: '🏃',
  Seizure: '💰',
  Conquest: '🏰',
  Escort: '👑',
  Defense: '🛡',
  Explore: '🧭',
  Capture: '💎',
  Chase: '🐎',
  Delivery: '📦',
  Complex: '✶',
  Raid: '☠',
  Domination: '👁',
}

export function missionIcon(type: string): string {
  return MISSION_ICON[type] ?? '⚔'
}

const MISSION_CACHE = new Map<string, string>()

/** The mission a floor's seeded encounter carries (memoized; the encounter is deterministic). */
export function floorMission(state: GameState, floor: number): string {
  const anchor = ANCHORS[floor]
  if (anchor) return anchor.missionType
  const scars = state.tower.loop?.scars ?? 0
  const key = `${state.seed}|${state.worldGrade}|${floor}|${scars}`
  let m = MISSION_CACHE.get(key)
  if (m === undefined) {
    m = buildEncounter(state, floor).mission.type
    MISSION_CACHE.set(key, m)
  }
  return m
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

/** "Act VI" — the number only, for an act the Master has not reached (no name, no spoiler). */
export function actNumeral(actId: string): string {
  const i = ACTS.findIndex((a) => a.id === actId)
  return ROMAN[i] ?? String(i + 1)
}

/** Is this act still ahead of the Master (not reached yet)? */
export function actAhead(actFrom: number, currentFloor: number): boolean {
  return actFrom > currentFloor
}
