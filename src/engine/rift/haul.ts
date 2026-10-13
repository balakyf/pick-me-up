/**
 * What a hero brings home from the Ruins. A LEAF module (types, tuning, rng, stats only):
 * engine/return/away.ts and engine/time read it, and must not pull in the rift itself —
 * rift → daily → tower → return → rift would be an import cycle.
 *
 * PURE and DETERMINISTIC: the return roll is rngFor(seed, 'ruins', heroId, completesAt).
 */

import type { GameState, MaterialId, OwnedHero } from '../types'
import { TUNING } from '../tuning'
import { rngFor, chance } from '../rng'
import { combatPowerForHero } from '../stats'

const R = TUNING.rift

/** What a returning hero brings back (deterministic in seed, hero, return time). */
export function expeditionHaul(hero: OwnedHero, seed: GameState['seed']): { gems: number; materials: Record<MaterialId, number> } {
  const at = hero.expedition?.completesAtWorld ?? 0
  const cp = combatPowerForHero(hero, hero.xp.level)
  const gems = R.gemsBase + Math.round((cp / 1000) * R.gemsPerKCp)
  const rare = chance(rngFor(seed, 'ruins', hero.id, at), R.rareChance).value
  return { gems, materials: rare ? { promotionStone: R.rareStones } : {} }
}
