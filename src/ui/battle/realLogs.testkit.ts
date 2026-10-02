/**
 * Real battle logs for the battle UI's tests: the playtest bots' own tower attempts
 * (src/sim), so the helpers are checked against what the engine actually writes — early
 * floors, escorts, survivals, sweeps over late waves, boss anchors.
 */
import type { CombatLog } from '../../engine/types'
import { simulate, type ProfileId } from '../../sim/sim'

let cache: CombatLog[] | null = null

/** Every tower attempt of an engaged and a whale bot over a few days (memoised). */
export function realLogs(): CombatLog[] {
  if (cache) return cache
  const out: CombatLog[] = []
  const runs: [ProfileId, number, number][] = [
    ['engaged', 7, 2],
    ['whale', 3, 3],
  ]
  for (const [profile, seed, days] of runs) {
    simulate(profile, seed, days, (_before, result) => {
      out.push(result.result.log)
    })
  }
  cache = out
  return out
}
