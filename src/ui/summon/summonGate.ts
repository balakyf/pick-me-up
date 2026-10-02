/**
 * What the summon buttons may do and, when they may not, the true reason: gold, gems, or
 * the Mobius crystal's charge (a whale with 30,000 gems is not short of gems when the
 * crystal is spent). Pure: the screen only shows it.
 */
import type { GameState, SummonPool } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { crystalChargeLeft, mercySummonAvailable, tutorialPullAvailable } from '../../engine/gacha'
import { t } from '../i18n/i18n'
import { fmtInt } from '../text'

const COST = TUNING.gacha.normalCostGold
const ADV = TUNING.gacha.advanced

export interface SummonGate {
  canOne: boolean
  canTen: boolean
  /** Why the single pull is blocked, else why the ten-pull is; null when both can go. */
  why: string | null
  /** The single pull is free (the crystal takes pity on a Master with no gold). */
  mercy: boolean
  /** The ten-pull is the free tutorial pull. */
  tutorial: boolean
  /** The crystal's charge (Advanced pool). */
  charge: number
}

/**
 * `nowWorld` (world-time now) lets the charge be read as of this moment: the crystal
 * refills with world days, and this scene does not tick the clock the way the lobby does.
 */
export function summonGate(state: GameState, pool: SummonPool, nowWorld?: number): SummonGate {
  const asOfNow =
    nowWorld !== undefined && nowWorld > state.meta.lastSeenAtWorld ? { ...state, meta: { ...state.meta, lastSeenAtWorld: nowWorld } } : state
  const charge = crystalChargeLeft(asOfNow)
  if (pool === 'normal') {
    const mercy = mercySummonAvailable(state)
    const tutorial = tutorialPullAvailable(state)
    const canOne = state.gold >= COST || mercy
    const canTen = tutorial || state.gold >= COST * 10
    const why = !canOne
      ? t('Not enough Gold — clear tower floors to earn more.')
      : !canTen
        ? t('A ten-pull costs {gold} Gold.', { gold: fmtInt(COST * 10) })
        : null
    return { canOne, canTen, why, mercy, tutorial, charge }
  }
  const gemsOne = state.gems >= ADV.costGems
  const gemsTen = state.gems >= ADV.tenPullGems
  const canOne = gemsOne && charge >= 1
  const canTen = gemsTen && charge >= 10
  const why = !canOne
    ? charge < 1
      ? t('The crystal is spent: charge {n}/{m}. It recharges +{k} each world-day.', { n: charge, m: ADV.dailyCharge, k: ADV.rechargePerDay })
      : t('Not enough gems — the Friday Soulforge dungeon pays them.')
    : !canTen
      ? charge < 10
        ? t('A ten-pull needs a full crystal (10 charge); it holds {n}.', { n: charge })
        : t('A ten-pull costs {n} gems.', { n: fmtInt(ADV.tenPullGems) })
      : null
  return { canOne, canTen, why, mercy: false, tutorial: false, charge }
}
