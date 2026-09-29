/**
 * Minigames (Layer 3 §C2) — the Master's active-skill layer. Every minigame reports a
 * `performance` in 0..1; skipping it auto-resolves at the Master's tracked skill, and
 * playing raises that skill. Two concrete minigames:
 *
 *   Blacksmithing — equipment grade-up (§A3): a seeded success roll whose odds follow the
 *                   canon ladder, scaled by performance. Failure costs the materials but
 *                   never the item (forgiving).
 *   Ballista      — canon F20: the tower ballista breaks the dragon's scales. On anchors
 *                   that declare it, the boss opens the fight already wounded.
 *
 * PURE and DETERMINISTIC: the forge roll is rngFor(seed, 'forge', itemId, refines).
 */

import type { CombatUnit, EquipmentGrade, EquipmentItem, EquipmentId, GameState, MetaState } from '../types'
import { TUNING } from '../tuning'
import { rngFor, chance } from '../rng'
import { gradeMagnitude, itemName, smithyUnlocked, statBlockFor } from '../equipment'

const M = TUNING.minigames
const LADDER: EquipmentGrade[] = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS']

export type MinigameKind = 'blacksmith' | 'ballista'

/** Clamp a reported performance to 0..1 (NaN → 0). */
export function clampPerformance(p: number): number {
  return Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0
}

/** Playing a minigame raises the Master's skill at it. */
export function practice(meta: MetaState, kind: MinigameKind): MetaState {
  const v = Math.min(M.maxSkill, Math.round((meta.skill[kind] + M.skillPerPlay) * 100) / 100)
  return { ...meta, skill: { ...meta.skill, [kind]: v } }
}

/** The grade above `g`, or null at the top of the forgeable ladder. */
export function nextEquipmentGrade(g: EquipmentGrade): EquipmentGrade | null {
  const i = LADDER.indexOf(g)
  return i >= 0 && i < LADDER.length - 1 ? LADDER[i + 1]! : null
}

/** Success odds for raising an item from `g` at a performance. */
export function upgradeOdds(g: EquipmentGrade, performance: number): number {
  const base = M.upgradeOdds[g] ?? 0
  return Math.min(M.maxOdds, base * (M.perfFloor + M.perfSpan * clampPerformance(performance)))
}

/** Gold + stones to attempt raising an item to its next grade. */
export function upgradeCost(item: EquipmentItem): { gold: number; promotionStone: number } | null {
  const to = nextEquipmentGrade(item.grade)
  if (to === null) return null
  return { gold: M.upgradeGoldPerM * gradeMagnitude(to), promotionStone: M.upgradeStones[to] ?? 0 }
}

/** Why an item can't be taken to the anvil now, or null. */
export function upgradeRefusal(state: GameState, itemId: EquipmentId): string | null {
  if (!smithyUnlocked(state)) return 'The Smithy is still cold.'
  const item = state.inventory.find((i) => i.id === itemId)
  if (!item) return 'No such item.'
  const cost = upgradeCost(item)
  if (cost === null) return 'This item is already at the top grade.'
  if (state.gold < cost.gold) return 'Not enough gold.'
  if ((state.materials.promotionStone ?? 0) < cost.promotionStone) return 'Not enough Promotion Stones.'
  return null
}

/**
 * Blacksmithing: pay, roll, and on success raise the item one grade (its stat block
 * follows; a bound weapon keeps its name and element). `performance` omitted = the
 * Master's skill (auto-resolve) and no practice. PURE.
 */
export function upgradeEquipment(
  state: GameState,
  itemId: EquipmentId,
  performance?: number,
): { state: GameState; success: boolean; odds: number } {
  const refusal = upgradeRefusal(state, itemId)
  if (refusal !== null) throw new Error(`upgradeEquipment: ${refusal}`)
  const item = state.inventory.find((i) => i.id === itemId)!
  const cost = upgradeCost(item)!
  const perf = performance === undefined ? state.meta.skill.blacksmith : clampPerformance(performance)
  const odds = upgradeOdds(item.grade, perf)
  const refines = item.refines ?? 0
  const roll = chance(rngFor(state.seed, 'forge', itemId, refines), odds)
  const to = nextEquipmentGrade(item.grade)!
  const upgraded: EquipmentItem = roll.value
    ? {
        ...item,
        grade: to,
        statBonus: statBlockFor(item.slot, to),
        name: item.exclusiveTo !== undefined ? item.name : itemName(item.slot, to),
        refines: refines + 1,
      }
    : { ...item, refines: refines + 1 }
  const meta = performance === undefined ? state.meta : practice(state.meta, 'blacksmith')
  return {
    success: roll.value,
    odds,
    state: {
      ...state,
      gold: state.gold - cost.gold,
      materials: { ...state.materials, promotionStone: (state.materials.promotionStone ?? 0) - cost.promotionStone },
      inventory: state.inventory.map((i) => (i.id === itemId ? upgraded : i)),
      meta,
    },
  }
}

/** Fraction of the boss's HP the ballista breaks at a performance. */
export function ballistaWound(performance: number): number {
  return Math.round(clampPerformance(performance) * M.ballistaMaxWound * 1000) / 1000
}

/** The boss opens the fight wounded: currentHP reduced by the ballista's wound. PURE. */
export function woundBoss(boss: CombatUnit, performance: number): CombatUnit {
  const hp = Math.max(1, Math.round(boss.stats.maxHP * (1 - ballistaWound(performance))))
  return { ...boss, currentHP: hp }
}
