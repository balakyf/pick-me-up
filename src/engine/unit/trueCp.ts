/**
 * True CP — the number combat actually fields for a hero (B23).
 *
 * The old display CP (stats + skills + engraving CP) left out equipment, passive and
 * engraving stat %, favor, the low-Sanity penalty and a withdrawn hero's dulling, so
 * gearing up never moved the Registry, the Party Board or the scout. This builds the
 * hero's battle unit exactly as the tower does (buildCombatUnit with the account's
 * inventory, then the estate's morale adjustment) and reads its CP and stats.
 *
 * PURE and DETERMINISTIC. The line does not affect a unit's stats or CP.
 */
import type { CombatUnit, DerivedStats, EquipmentItem, GameState, Line, OwnedHero } from '../types'
import { SKILLS } from '../content'
import { moraleAdjust } from '../estate/deploy'
import { buildCombatUnit } from './unit'

/** The account context true CP reads (inventory for gear; the estate for withdrawal). */
export type CpContext = Pick<GameState, 'inventory'> & Partial<Pick<GameState, 'estate'>>

/** The hero's battle unit, as the tower would field it on `line`. */
export function heroUnitFull(ctx: CpContext, hero: OwnedHero, line: Line = 'front'): CombatUnit {
  const unit = buildCombatUnit(hero, line, SKILLS, ctx.inventory as EquipmentItem[])
  return ctx.estate ? moraleAdjust(ctx as GameState, unit) : unit
}

/** True CP: gear, passives, engraving %, favor, the Sanity penalty and withdrawal included. */
export function heroCpFull(ctx: CpContext, hero: OwnedHero): number {
  return heroUnitFull(ctx, hero).cp
}

/** The combat stat block the hero would fight with (gear and every modifier included). */
export function heroStatsFull(ctx: CpContext, hero: OwnedHero): DerivedStats {
  return heroUnitFull(ctx, hero).stats
}
