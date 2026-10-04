/**
 * The tower's endgame floors (lane O), as `tower.buildEncounter` applies them: the floors
 * behind the Wall get their own missions (wall.ts), and past F90 the world's fate shapes
 * every floor (endgame.ts). Everywhere else the build comes back untouched. PURE.
 */
import type { CombatUnit, EnemyWave, GameState, Mission } from '../types'
import { fateEncounter, scaleWaves } from './endgame'
import { isPostWallFloor, postWallEncounter, postWallRamp } from './wall'

type Built = { waves: EnemyWave[]; mission: Mission; allies?: CombatUnit[]; reserves?: Record<string, CombatUnit[]> }

export function endgameFloor(state: Pick<GameState, 'tower'>, floor: number, built: Built, opts: { anchor: boolean; allyLevel: number }): Built {
  let out = built
  if (!opts.anchor && isPostWallFloor(floor)) out = scaleWaves({ ...out, ...postWallEncounter(floor, out, opts.allyLevel) }, postWallRamp(floor))
  return fateEncounter(state, floor, out)
}
