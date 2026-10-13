/**
 * Doors: player-chosen risk for the next floor (spec 2026-10-12 S13). Owner: WP3.
 *
 * From F3, every clear offers Doors for the next floor (unless it is an authored anchor,
 * a looped F36-39 floor or a Wailing Wall floor). `doors[0]` is always a fight the party
 * was going to have anyway — Path, or a Breather right after a boss — so ATTEMPT_FLOOR
 * with no choice made fights `doors[0]` and nothing ever blocks on a Door. The second Door
 * is the Skull (Elite), or sometimes a Rest stop (before a boss) or a Cache.
 *
 * Rest and Cache resolve on CHOOSE_DOOR with no battle: they advance the floor and set
 * `highestCleared` (no softlock), but pay only their own reward (no Master XP, PI or
 * floor gold).
 *
 * Randomness: stream `rngFor(state.seed, 'doors', floor)` only — the same floor always
 * offers the same Doors (no re-roll by retrying). PURE.
 */
import { TUNING } from '../tuning'
import { clampSanity } from '../kitchen'
import { rngFor, chance } from '../rng'
import type { Door, DoorReward, FloorKind, GameState, HeroId, OwnedHero, TowerState } from '../types'
import { floorKindBase, isAnchorFloor, isFightKind } from './kinds'

const CL = TUNING.climb
const T = TUNING.tower

/** The reward icon each kind of Door shows. */
export const DOOR_REWARD: Readonly<Record<FloorKind, DoorReward>> = {
  tutorial: 'gold',
  path: 'gold',
  breather: 'xp',
  elite: 'boon',
  boss: 'gold',
  rest: 'sanity',
  cache: 'stones',
}

/** Door names (English source strings for `t()`; Door buttons never say "Enter"). */
export const DOOR_LABEL: Readonly<Record<FloorKind, string>> = {
  tutorial: 'Tutorial',
  path: 'Path',
  breather: 'Breather',
  elite: 'Skull door',
  boss: 'Boss',
  rest: 'Rest stop',
  cache: 'Cache',
}

/** One line on what each Door holds (English source strings for `t()`). */
export const DOOR_BLURB: Readonly<Record<FloorKind, string>> = {
  tutorial: 'A training floor.',
  path: 'A fair fight. Standard rewards.',
  breather: 'A lighter fight to catch your breath.',
  elite: 'A much harder fight: double gold, a Promotion Stone and a Boon.',
  boss: 'The floor’s guardian.',
  rest: 'No fight. The party rests (+Sanity) and cooks a meal.',
  cache: 'No fight. A cache of gold and stones.',
}

/** Does the climb offer Doors for `floor`? From `directorFromFloor`, never for an anchor,
 *  the looped F36-40 mission, the Wailing Wall or past the summit. */
export function doorsOfferedFor(floor: number): boolean {
  if (floor < CL.directorFromFloor || floor > T.sliceTopFloor) return false
  if (isAnchorFloor(floor) || floorKindBase(floor) === 'boss') return false
  if (floor >= T.loop.start && floor <= T.loop.gate) return false
  if (floor >= T.wallFloor && floor <= T.wallFloor + 9) return false
  return true
}

function door(kind: FloorKind): Door {
  return { kind, reward: DOOR_REWARD[kind] }
}

/**
 * The Doors offered for `nextFloor`, or null when it has no choice. `doors[0]` is Path —
 * or a Breather right after a boss — and the second is the Skull, replaced by a Rest stop
 * before a boss (chance `restBeforeBoss`) or else by a Cache (chance `treasureChance`).
 * Both draws are always taken, in that order, on the floor's own stream.
 */
export function rollDoors(state: GameState, nextFloor: number): Door[] | null {
  if (!doorsOfferedFor(nextFloor)) return null
  const D = CL.doors
  const first: FloorKind = D.breatherAfterBoss && floorKindBase(nextFloor - 1) === 'boss' ? 'breather' : 'path'
  let r = rngFor(state.seed, 'doors', nextFloor)
  const rest = chance(r, D.restBeforeBoss)
  r = rest.rng
  const cache = chance(r, D.treasureChance)
  let second: FloorKind = 'elite'
  if (floorKindBase(nextFloor + 1) === 'boss' && rest.value) second = 'rest'
  else if (cache.value) second = 'cache'
  const kinds: FloorKind[] = [first, second]
  for (const extra of ['elite', 'cache', 'rest'] as FloorKind[]) if (!kinds.includes(extra)) kinds.push(extra)
  return kinds.slice(0, Math.max(1, D.offered)).map(door)
}

/**
 * The tower's floor-kind bookkeeping after the position changed (an advance, a retry, the
 * F40 rollback, a Rest/Cache door): roll the Doors for the floor now current and set
 * `kind` to the first Door, or to `floorKindBase` when there is no choice. PURE.
 */
export function withFloorDoors(state: GameState, tower: TowerState): TowerState {
  const doors = rollDoors(state, tower.currentFloor)
  return { ...tower, doors, kind: doors?.[0]?.kind ?? floorKindBase(tower.currentFloor) }
}

/** Why CHOOSE_DOOR would be refused, or null. */
export function chooseDoorRefusal(state: GameState, index: number): string | null {
  const doors = state.tower.doors
  if (state.tower.event !== null) return 'Resolve the event floor first.'
  if (doors === null || doors.length === 0) return 'No doors are open on this floor.'
  if (!Number.isInteger(index) || index < 0 || index >= doors.length) return 'There is no such door.'
  return null
}

/** CHOOSE_DOOR: take the `index`-th Door offered for the current floor. A fight Door sets
 *  `tower.kind` (the next ATTEMPT_FLOOR fights it); a Rest stop or Cache resolves now and
 *  advances the floor. PURE; throws when refused. */
export function chooseDoor(state: GameState, index: number, nowWorld: number = 0): GameState {
  const why = chooseDoorRefusal(state, index)
  if (why !== null) throw new Error(`chooseDoor: ${why}`)
  const chosen = state.tower.doors![index]!
  if (isFightKind(chosen.kind)) {
    return { ...state, tower: { ...state.tower, kind: chosen.kind, doors: null, hiddenFound: [...state.tower.hiddenFound] } }
  }

  const floor = state.tower.currentFloor
  let next: GameState = state
  if (chosen.kind === 'rest') {
    const R = CL.reward
    // The party in the slots rests (the dead and those away don't).
    const heroes: Record<HeroId, OwnedHero> = { ...state.heroes }
    for (const id of state.party.slots) {
      const h = id ? state.heroes[id] : undefined
      if (h === undefined || !h.alive || h.captiveOf || h.expedition !== null) continue
      heroes[h.id] = { ...h, sanity: clampSanity(h.sanity + R.restSanity) }
    }
    next = { ...next, heroes, life: { ...next.life, pantry: next.life.pantry + R.restMeals } }
  } else {
    const materials = { ...state.materials, promotionStone: (state.materials.promotionStone ?? 0) + CL.reward.cacheStones }
    next = { ...next, gold: next.gold + cacheGold(state, floor), materials }
  }
  const advanced: TowerState = {
    ...state.tower,
    currentFloor: floor + 1,
    attemptIndex: 0,
    highestCleared: Math.max(state.tower.highestCleared, floor),
    hiddenFound: [...state.tower.hiddenFound],
  }
  return { ...next, tower: withFloorDoors(next, advanced) }
}

/** Gold a Cache Door on `floor` holds (for the Door preview). */
export function cacheGold(state: GameState, floor: number): number {
  return Math.round(CL.reward.cacheGoldPerFloor * floor * (T.worldMult[state.worldGrade] ?? 1))
}
