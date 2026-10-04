/**
 * Missions on the filler floors (lane P). Layer 2 §4.4: "each floor band biases the mission
 * table, so procedural floors feel like their act". Before this, a filler floor was almost
 * always a Subjugation (the Ruins rolled a Survival, the late acts a Survival or an Escape,
 * the coast a Seizure). Now each act draws from the seven mission primitives with weights
 * that fit it:
 *
 *  - the Prairie teaches (its floors are authored lessons: elements, lines, skills, the
 *    first big move to Guard against at F6, the first marked leader at F8 — canon's goblin
 *    raiders), and its two free floors draw Subjugation, Survival or a Hunt;
 *  - the Ruins are full of people to get out (Escort: canon F12–19 "Guard"), with assassins
 *    in the halls;
 *  - the Swamp floors sink under the party (Escape: reach the far side before the mire takes
 *    you), and poison;
 *  - the Drowned Coast is a treasure coast (Seizure);
 *  - the Order's War is a siege (Defense: hold the waves) and a hunt for its officers;
 *  - the Inflection is a horde (Survival) with leaders worth hunting.
 *
 * The F36–40 loop, the anchors, the Wailing Wall and the floors past it keep their own logic
 * (the tower's legacy mix), so this table never touches them.
 *
 * Every draw is `rngFor(seed, 'filler-mission', floor)`: its own stream, so the floor's
 * enemies (the 'floor' stream) are drawn exactly as before. PURE.
 *
 * The teaching floors (TEACHING_FLOORS) are the first place each mechanic matters, and they
 * are gentle and plainly about it: F6 has one foe with one big move (and Isel's Guard tip),
 * F12's escort walks a short road. The coach (`ui/qol/coach.ts`) times its tips to them.
 */
import type { EnemyTemplate, Seed } from '../types'
import { TUNING } from '../tuning'
import { rngFor, weightedPick } from '../rng/rng'
import { actForFloor } from './acts'
import { ANCHORS } from './anchors'

/** The filler missions, each built from the seven primitives. */
export type FillerMissionKind = 'subjugation' | 'survival' | 'defense' | 'hunt' | 'escort' | 'escape' | 'seizure'

export const FILLER_MISSION_KINDS: readonly FillerMissionKind[] = ['subjugation', 'survival', 'defense', 'hunt', 'escort', 'escape', 'seizure']

/** The canon mission label each kind carries (the war room, the HUD and the floor list show it). */
export const MISSION_LABEL: Record<FillerMissionKind, string> = {
  subjugation: 'Subjugation',
  survival: 'Survival',
  defense: 'Defense',
  hunt: 'Hunt',
  escort: 'Escort',
  escape: 'Escape',
  seizure: 'Seizure',
}

/** The tags the filler missions put on their units. */
export const MISSION_TAGS = {
  /** A Hunt's marked leader (Defeat). */
  leader: 'marked_leader',
  /** A Seizure's carrier (Acquire), as the legacy coast mix named it. */
  cache: 'cache_bearer',
  /** An Escort's NPC (Protect). */
  escort: 'escort',
  /** The F47 vault's keeper (Acquire): Priasis's key opens it. */
  vault: 'ragna_vault',
} as const

/** The lane's numbers (a module tuning block, rule 6). */
export const MISSION_TUNING = {
  /** Escort: steps to walk the NPC out, the NPC's extra levels, and the share of the floor's
   *  budget the enemies fill (the party spends turns on the road and on the escort). */
  escortDistance: 32,
  escortLevelBonus: 4,
  escortBudget: 0.85,
  /** Defense: waves to hold, each filled to this share of the floor's budget (the line is
   *  hit twice, but never by everything at once). */
  defenseWaves: 2,
  defenseWaveShare: 0.6,
  /** Hunt: the marked leader's extra levels; it carries one wound-up move (the Guard lesson). */
  huntLevelBonus: 3,
  leaderMove: 'e_haymaker',
  /** A gentle teaching floor fills to this share of its budget. */
  teachingBudget: 0.85,
  /** Survival on the Prairie (the other acts keep the tower's Ruins / late values). */
  prairieSurviveTicks: 600,
  /** The F47 vault keeper's extra levels. */
  vaultLevelBonus: 4,
} as const

export interface MissionWeight {
  kind: FillerMissionKind
  weight: number
}

/**
 * The per-act mission table (by act id). An act without an entry (the Wall, the floors past
 * ninety) keeps the tower's legacy mix.
 */
export const MISSION_TABLE: Readonly<Record<string, readonly MissionWeight[]>> = {
  // Canon F1–9: "Subjugation / Conquest / Survival / Explore". Only F7 and F9 draw.
  prairie: [
    { kind: 'subjugation', weight: 5 },
    { kind: 'survival', weight: 2 },
    { kind: 'hunt', weight: 2 },
  ],
  // Canon F12–19: "Subjugation / Guard / Exploration": people to get out, assassins in the halls.
  ruins: [
    { kind: 'subjugation', weight: 4 },
    { kind: 'escort', weight: 3 },
    { kind: 'survival', weight: 2 },
    { kind: 'hunt', weight: 1 },
  ],
  // The mire gives way under the party: reach the far side. Poison in the reeds.
  swamp: [
    { kind: 'subjugation', weight: 3 },
    { kind: 'escape', weight: 3 },
    { kind: 'survival', weight: 2 },
    { kind: 'hunt', weight: 1 },
    { kind: 'escort', weight: 1 },
  ],
  // Canon F31–35: Seizure. A treasure coast.
  coast: [
    { kind: 'seizure', weight: 4 },
    { kind: 'subjugation', weight: 2 },
    { kind: 'escort', weight: 1 },
  ],
  // The Order's war (outside the loop): a siege, and a hunt for its officers.
  order: [
    { kind: 'defense', weight: 3 },
    { kind: 'hunt', weight: 3 },
    { kind: 'subjugation', weight: 3 },
    { kind: 'survival', weight: 1 },
    { kind: 'escape', weight: 1 },
    { kind: 'escort', weight: 1 },
  ],
  // The curve steepens: hordes to outlast, leaders worth hunting.
  inflection: [
    { kind: 'survival', weight: 3 },
    { kind: 'hunt', weight: 2 },
    { kind: 'defense', weight: 2 },
    { kind: 'subjugation', weight: 2 },
    { kind: 'escape', weight: 1 },
  ],
}

/** The coach's lessons, in the order the climb teaches them (ui/qol/coach.ts words them). */
export type LessonId =
  | 'elements'
  | 'lines'
  | 'skills'
  | 'missions'
  | 'telegraph'
  | 'focus'
  | 'retreat'
  | 'healing'
  | 'statuses'
  | 'phases'
  | 'morale'

/** An authored filler floor: a lesson's first floor, or a story set piece. */
export interface TeachingFloor {
  kind: FillerMissionKind
  /** The lesson this floor is the first real use of. */
  lesson?: LessonId
  /** Fill to MISSION_TUNING.teachingBudget of the floor's budget (a gentle first time). */
  gentle?: boolean
  /** The first wave's last foe is of this template, at the back (a soldier who stuns, the
   *  goblin who winds up the big swing, the raiders' chief). */
  lead?: string
  /** One foe (the lead, else the strongest) carries this wound-up move. */
  bigMove?: string
  /** A Seizure's carrier tag, when it is not the plain cache (the F47 vault). */
  tag?: string
  /** Extra levels for the mission's carrier / leader (and for the big move's carrier). */
  levelBonus?: number
}

/**
 * The floors that teach (and F47, where the F45 key opens a door). Each one is the first
 * floor where its mechanic matters, and is gentle about it. F1–4 stay plain Subjugations,
 * exactly as they were (the coach speaks over them).
 */
export const TEACHING_FLOORS: Readonly<Record<number, TeachingFloor>> = {
  1: { kind: 'subjugation', lesson: 'elements' },
  2: { kind: 'subjugation', lesson: 'lines' },
  3: { kind: 'subjugation', lesson: 'skills' },
  4: { kind: 'subjugation' },
  // One goblin, one big swing: the '!' over its head, and Isel's word about Guard.
  6: { kind: 'subjugation', lesson: 'telegraph', gentle: true, lead: 'goblin', bigMove: 'e_haymaker', levelBonus: 2 },
  // Canon F8: goblin raiders. Their chief is marked: mark him, and the floor is won.
  8: { kind: 'hunt', lesson: 'focus', gentle: true, lead: 'goblin' },
  // The first escort: a short road, a sturdy refugee, and the healing lesson.
  12: { kind: 'escort', lesson: 'healing', gentle: true },
  // A soldier's shield bash stuns: the statuses lesson.
  13: { kind: 'subjugation', lesson: 'statuses', lead: 'soldier' },
  // The swamp's first floor sinks: the first Escape is plainly one.
  21: { kind: 'escape', gentle: true },
  // The coast's first treasure.
  31: { kind: 'seizure', gentle: true },
  // The Order's first siege after the loop.
  43: { kind: 'defense', gentle: true },
  // The lock the F45 key turned: Priasis's vault, held by the Order. Take its seal.
  47: { kind: 'seizure', tag: MISSION_TAGS.vault, levelBonus: MISSION_TUNING.vaultLevelBonus },
  // The Inflection's first horde.
  71: { kind: 'survival' },
}

/** The escort NPC each act fields (hero-side, never acts; the mission fails if it falls). */
export const ESCORT_TEMPLATES: Readonly<Record<string, EnemyTemplate>> = {
  refugee: { id: 'refugee', name: 'Refugee', element: 'physical', attrMult: { str: 0.2, agi: 0.7, vit: 1.6, int: 0.4, wil: 0.8 } },
  pearl_diver: { id: 'pearl_diver', name: 'Pearl Diver', element: 'water', attrMult: { str: 0.3, agi: 0.9, vit: 1.5, int: 0.4, wil: 0.8 } },
  deserter: { id: 'deserter', name: 'Order Deserter', element: 'dark', attrMult: { str: 0.4, agi: 0.6, vit: 1.8, int: 0.4, wil: 1.0 } },
}

/** Which escort an act's floors field. */
export const ESCORT_BY_ACT: Readonly<Record<string, string>> = {
  prairie: 'refugee',
  ruins: 'refugee',
  swamp: 'refugee',
  coast: 'pearl_diver',
  order: 'deserter',
  inflection: 'deserter',
}

export function escortTemplateFor(floor: number): EnemyTemplate {
  return ESCORT_TEMPLATES[ESCORT_BY_ACT[actForFloor(floor).id] ?? 'refugee']!
}

/** What a filler floor fights for: the drawn (or authored) kind, and its teaching floor. */
export interface FillerMissionPlan {
  floor: number
  kind: FillerMissionKind
  teaching?: TeachingFloor
}

/** The F36–40 loop's floors keep their own logic. */
export function isLoopFloor(floor: number): boolean {
  return floor >= TUNING.tower.loop.start && floor <= TUNING.tower.loop.gate
}

/**
 * The mission a filler floor carries, or null when the floor keeps the tower's own logic
 * (an anchor, the loop, the Wall and past it). Deterministic in (seed, floor).
 */
export function fillerMissionPlan(seed: Seed, floor: number): FillerMissionPlan | null {
  if (ANCHORS[floor] !== undefined || isLoopFloor(floor)) return null
  const table = MISSION_TABLE[actForFloor(floor).id]
  if (table === undefined) return null
  const teaching = TEACHING_FLOORS[floor]
  if (teaching !== undefined) return { floor, kind: teaching.kind, teaching }
  const draw = weightedPick(
    rngFor(seed, 'filler-mission', floor),
    table.map((e) => ({ item: e.kind, weight: e.weight })),
  )
  return { floor, kind: draw.value }
}

/** Survival ticks on a filler floor of this act. */
export function fillerSurviveTicks(floor: number): number {
  const act = actForFloor(floor).id
  if (act === 'prairie') return MISSION_TUNING.prairieSurviveTicks
  if (act === 'ruins') return TUNING.tower.ruinsSurviveTicks
  return TUNING.tower.lateSurviveTicks
}
