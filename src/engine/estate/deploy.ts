/**
 * The estate's two small hooks into a tower deployment (imported by tower.ts, so it
 * stays dependency-light): a burnt-out hero or one away on a bounty refuses the order,
 * and a withdrawn hero fights a little worse. PURE.
 */
import type { CombatUnit, DerivedStats, GameState, HeroId } from '../types'
import { TRAUMA } from './constants'

/** Burnt out (still resting) or out on a bounty: this hero won't deploy right now. */
export function refusesDeploy(state: GameState, heroId: HeroId): boolean {
  const t = state.estate?.trauma?.[heroId]
  if (t && t.burnoutUntil !== null && t.burnoutUntil > state.meta.lastSeenAtWorld) return true
  return (state.estate?.bounties ?? []).some((b) => b.heroIds.includes(heroId))
}

const SCALED: (keyof DerivedStats)[] = ['maxHP', 'pAtk', 'mAtk', 'pDef', 'mDef', 'spd']

/** A withdrawn hero's unit, dulled (every combat stat × TRAUMA.withdrawnStat). */
export function moraleAdjust(state: GameState, unit: CombatUnit): CombatUnit {
  const id = unit.sourceHeroId
  if (!id || !state.estate?.trauma?.[id]?.withdrawn) return unit
  const k = TRAUMA.withdrawnStat
  const stats = { ...unit.stats }
  for (const s of SCALED) stats[s] = Math.max(1, Math.round(stats[s] * k))
  return { ...unit, stats, currentHP: stats.maxHP, cp: Math.round(unit.cp * k) }
}
