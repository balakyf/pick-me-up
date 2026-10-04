/**
 * Lane P: the bots read the mission before they go in, as a Master reads the briefing. A
 * floor that names someone gets the Tactical Center's free pre-battle levers: the MARK on the
 * foe whose fall wins it (a hunt's leader, a carrier, a boss), and a PROTECT on the escort
 * (foes look past it while anyone else stands). Pure; the sim passes the directive as the
 * attempt's focus, exactly as the war room's "Before the fight" panel would.
 */
import type { FocusDirective, GameState } from '../engine/types'
import { buildEncounter } from '../engine/tower'
import { TUNING } from '../engine/tuning'

/** The free mark and protect a reading Master gives this floor (undefined when it names no one). */
export function missionDirective(state: GameState): FocusDirective | undefined {
  const floor = state.tower.currentFloor
  if (floor > TUNING.tower.sliceTopFloor) return undefined
  let enc
  try {
    enc = buildEncounter(state, floor)
  } catch {
    return undefined
  }
  const out: FocusDirective = {}
  const foes = enc.waves.flatMap((w) => w.units)
  for (const o of enc.mission.objectives) {
    if ((o.kind === 'defeat' || o.kind === 'acquire') && out.focusEnemyId === undefined) {
      // A looming giant is never the one to mark (the F10 creature is outlasted, not fought).
      const target = foes.find((u) => u.targetTag === o.targetTag && !u.keywords.some((k) => k.kind === 'looming'))
      if (target !== undefined) out.focusEnemyId = target.id
    } else if (o.kind === 'protect') {
      const escort = (enc.allies ?? []).find((a) => a.targetTag === o.targetTag)
      if (escort !== undefined) out.overlookedAllyIds = [...(out.overlookedAllyIds ?? []), escort.id]
    }
  }
  return out.focusEnemyId !== undefined || out.overlookedAllyIds !== undefined ? out : undefined
}
