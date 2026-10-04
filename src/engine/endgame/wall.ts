/**
 * Behind the Wall (lane O): the floors F81–89 between the Siege of the Wailing Wall (F80)
 * and the Herald (F90). Each gets its own mission, built from the floor's power-budgeted
 * Fragment squad (the Wall seed: the same for every Master), so the budget never moves:
 * only what the party must do with it.
 *
 *   F81 The Breach Road      Escape     — cross the breach before it closes
 *   F82 The Shard Archive    Seizure    — take what the archive's keeper holds
 *   F83 The Hollow Garrison  Survival   — two waves, hold until the bell
 *   F84 The Wardens' Vigil   Subjugation— the vigil's captain behind its guard
 *   F85 (anchor)             the Fragment Colossus and the ballista
 *   F86 Taonier's Last Banner Escort    — keep the Al Ragna banner standing
 *   F87 The Echoing Hall     Defense    — three waves, each an echo of the last
 *   F88 The Door of Ninety   Conquest   — two waves at the last door
 *   F89 The Antechamber      Conquest   — the last floor before the end (the last truth)
 *
 * PURE and DETERMINISTIC: no draw of its own (the units come from the filler fill).
 */
import type { CombatUnit, EnemyWave, Mission } from '../types'
import { ALLY_TEMPLATES } from '../content'
import { buildAllyUnit } from '../unit'
import { ENDGAME } from './tuning'
import { TUNING } from '../tuning'

export interface PostWallFloor {
  floor: number
  /** The mission type it carries (the war room's icon and the story's check). */
  missionType: string
}

/** The floors behind the Wall with a mission of their own (F85 is an anchor). */
export const POST_WALL: Readonly<Record<number, PostWallFloor>> = {
  81: { floor: 81, missionType: 'Escape' },
  82: { floor: 82, missionType: 'Seizure' },
  83: { floor: 83, missionType: 'Survival' },
  84: { floor: 84, missionType: 'Subjugation' },
  86: { floor: 86, missionType: 'Escort' },
  87: { floor: 87, missionType: 'Defense' },
  88: { floor: 88, missionType: 'Conquest' },
  89: { floor: 89, missionType: 'Conquest' },
}

export function isPostWallFloor(floor: number): boolean {
  return POST_WALL[floor] !== undefined
}

/** How much harder than its budget a floor behind the Wall fields its squad (the climb to
 *  the Herald): 1 + rampPerFloor × (floor − 80). */
export function postWallRamp(floor: number): number {
  return isPostWallFloor(floor) ? 1 + ENDGAME.postWall.rampPerFloor * (floor - TUNING.tower.wallFloor) : 1
}

/** The strongest unit's index (ties: the first). */
function strongest(units: readonly CombatUnit[]): number {
  let best = 0
  for (let i = 1; i < units.length; i++) if (units[i]!.cp > units[best]!.cp) best = i
  return best
}

/** Deal units into `n` waves, round-robin (every wave gets a share of the squad). */
function dealWaves(units: readonly CombatUnit[], n: number): EnemyWave[] {
  const k = Math.max(1, Math.min(n, units.length))
  const waves: CombatUnit[][] = Array.from({ length: k }, () => [])
  units.forEach((u, i) => waves[i % k]!.push(u))
  return waves.map((w) => ({ units: w }))
}

export interface PostWallBuilt {
  waves: EnemyWave[]
  mission: Mission
  allies?: CombatUnit[]
}

/**
 * Reshape a post-Wall floor's budget-filled squad into its own mission. `filled` is the
 * floor's filler build (one wave); `allyLevel` the floor's base enemy level (an escort is
 * fielded at it). Floors without a mission of their own come back unchanged.
 */
export function postWallEncounter(floor: number, filled: { waves: EnemyWave[]; mission: Mission }, allyLevel: number): PostWallBuilt {
  const def = POST_WALL[floor]
  const units = filled.waves.flatMap((w) => w.units)
  if (!def || units.length === 0) return filled
  const P = ENDGAME.postWall
  const type = def.missionType
  switch (floor) {
    case 81:
      return { waves: [{ units }], mission: { type, objectives: [{ kind: 'reach', distance: P.breachDistance }], timer: null } }
    case 82: {
      const i = strongest(units)
      const tagged = units.map((u, j) => (j === i ? { ...u, targetTag: 'archive_keeper' } : u))
      return { waves: [{ units: tagged }], mission: { type, objectives: [{ kind: 'acquire', targetTag: 'archive_keeper' }], timer: null } }
    }
    case 83:
      return { waves: dealWaves(units, 2), mission: { type, objectives: [{ kind: 'survive', ticks: P.garrisonTicks }], timer: P.garrisonTicks } }
    case 84: {
      const i = strongest(units)
      const captain = { ...units[i]!, targetTag: 'vigil_captain' }
      const guard = units.filter((_, j) => j !== i)
      const waves = guard.length > 0 ? [{ units: guard }, { units: [captain] }] : [{ units: [captain] }]
      return { waves, mission: { type, objectives: [{ kind: 'defeat', targetTag: 'vigil_captain' }], timer: null } }
    }
    case 86: {
      const banner = buildAllyUnit(ALLY_TEMPLATES.al_ragna_banner!, allyLevel, `a${floor}_0`, {
        line: 'back',
        targetTag: 'al_ragna_banner',
        levelBonus: P.bannerLevelBonus,
      })
      return {
        waves: dealWaves(units, 2),
        mission: { type, objectives: [{ kind: 'protect', targetTag: 'al_ragna_banner' }, { kind: 'annihilate' }], timer: null },
        allies: [banner],
      }
    }
    case 87:
      return { waves: dealWaves(units, 3), mission: { type, objectives: [{ kind: 'defend', waves: Math.min(3, units.length) }], timer: null } }
    case 88:
      return { waves: dealWaves(units, 2), mission: { type, objectives: [{ kind: 'annihilate' }], timer: null } }
    default:
      return { waves: [{ units }], mission: { type, objectives: [{ kind: 'annihilate' }], timer: null } }
  }
}
