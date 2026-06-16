/**
 * Unit assembly — the Hero/Enemy → CombatUnit seam.
 *
 * This module owns the ONLY path from persisted/authored data into the combat
 * sim's runtime shape. The combat module treats heroes and enemies identically
 * as CombatUnit and NEVER recomputes stats: it reads the frozen snapshot built
 * here. So this is where leveling, derived stats, SP pools, CP, the implicit
 * basic attack, and keyword carry-over all get resolved exactly once.
 *
 * All functions are PURE and DETERMINISTIC: no RNG (unit assembly is fully
 * determined by its inputs), no mutation of inputs, fresh objects returned.
 *
 * Numbers come from TUNING (via the stats module); formula SHAPES that belong to
 * stats (deriveStats, deriveMaxSP, combatPower) are imported, never re-derived.
 */

import type {
  OwnedHero,
  Line,
  SkillEffect,
  SkillRegistry,
  CombatUnit,
  DamageType,
  EnemyTemplate,
  PrimaryAttrs,
  KeywordTag,
  DerivedStats,
  EquipmentItem,
  Element,
} from '../types'
import {
  deriveStats,
  deriveStatsForHero,
  deriveMaxSP,
  leveledAttrs,
  combatPower,
} from '../stats'
import { applySanityPenalty } from '../kitchen'
import { equipmentBonus } from '../equipment'

// ─────────────────────────────────────────────────────────────────────────────
// Basic attack & skill resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The implicit basic attack synthesized for a hero. Every unit gets one, so a
 * hero's authored skillIds are purely additive (and may be empty). A mage's
 * basic attack deals magic damage; everyone else deals physical. It carries the
 * hero's own element by default, costs no SP, and hits one target. `element`
 * overrides the carried element (a wielded weapon's element override, §5.4).
 */
export function basicAttackFor(hero: OwnedHero, element: Element = hero.element): SkillEffect {
  const damageType: DamageType = hero.heroClass === 'mage' ? 'magic' : 'physical'
  return {
    id: 'basic',
    name: 'Attack',
    skillMult: 1.0,
    damageType,
    element,
    target: 'single',
    spCost: 0,
  }
}

/**
 * Resolve a list of skill ids against a registry into their SkillEffect blocks.
 * Unknown ids are silently skipped (an authored cameo may reference a skill not
 * present in the slice's small registry, and a cameo may have none at all).
 * Order is preserved.
 */
export function resolveSkills(skillIds: string[], registry: SkillRegistry): SkillEffect[] {
  const out: SkillEffect[] = []
  for (const id of skillIds) {
    const effect = registry[id]
    if (effect !== undefined) out.push(effect)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero → CombatUnit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assemble a battle-ready CombatUnit from a persisted OwnedHero.
 *
 * Level is the hero's current level. Stats/SP are derived once from the leveled
 * attributes and frozen onto the unit. The skill list is the implicit basic
 * attack followed by the hero's resolved authored skills. CP is the display CP
 * of the derived stats. sourceHeroId links back to the OwnedHero for XP and
 * permadeath bookkeeping after the battle.
 */
export function buildCombatUnit(
  hero: OwnedHero,
  line: Line,
  registry: SkillRegistry = {},
  inventory: readonly EquipmentItem[] = [],
): CombatUnit {
  const level = hero.xp.level
  // Low Sanity weakens the hero BEFORE the snapshot freezes (combat never recomputes).
  const base = applySanityPenalty(deriveStatsForHero(hero, level), hero.sanity)
  // Equipment adds a flat block ON TOP of the morale-adjusted base (gear is unaffected
  // by Sanity), and a weapon may override the wielder's element + carry keywords (§5.4).
  const gear = equipmentBonus(hero, inventory)
  const stats: DerivedStats = { ...base }
  for (const key of Object.keys(gear.stats) as (keyof DerivedStats)[]) {
    const v = gear.stats[key]
    if (v !== undefined) stats[key] = stats[key] + v
  }
  const element = gear.element ?? hero.element

  const leveled = leveledAttrs(hero.baseAttrs, hero.growthGrades, level)
  const maxSP = deriveMaxSP(leveled.wil)

  return {
    id: hero.id as string,
    name: hero.name,
    side: 'hero',
    unitClass: hero.heroClass,
    element,
    line,
    level,
    stats,
    maxSP,
    currentHP: stats.maxHP,
    currentSP: maxSP,
    actionGauge: 0,
    alive: true,
    skills: [basicAttackFor(hero, element), ...resolveSkills(hero.skillIds, registry)],
    keywords: [...gear.keywords],
    cp: combatPower(stats),
    sourceHeroId: hero.id,
    // Carried for the combat panic check; enemies have no Sanity (field absent).
    sanity: hero.sanity,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EnemyTemplate → CombatUnit
// ─────────────────────────────────────────────────────────────────────────────

/** The implicit basic attack every enemy fights with (physical single-strike). */
function enemyBasicAttack(template: EnemyTemplate): SkillEffect {
  return {
    id: 'e_basic',
    name: 'Strike',
    skillMult: 1.0,
    damageType: 'physical',
    element: template.element,
    target: 'single',
    spCost: 0,
  }
}

/**
 * Assemble a CombatUnit from an EnemyTemplate at a floor level.
 *
 * An enemy IS a Layer 0 unit: its primary attributes are round(attrMult × effLevel)
 * per attribute (effLevel = level + levelBonus), run through the SAME deriveStats
 * the heroes use. Template keywords are carried (e.g. the Black Priest's `phased`)
 * and any per-group keywords are appended. targetTag defaults to the template id
 * so Defeat(target) missions can identify it. Enemies carry NO sourceHeroId.
 */
export function buildEnemyUnit(
  template: EnemyTemplate,
  level: number,
  instanceId: string,
  opts?: {
    line?: Line
    levelBonus?: number
    keywords?: KeywordTag[]
    targetTag?: string
  },
): CombatUnit {
  const effLevel = level + (opts?.levelBonus ?? 0)

  const attrs: PrimaryAttrs = {
    str: Math.round(template.attrMult.str * effLevel),
    agi: Math.round(template.attrMult.agi * effLevel),
    vit: Math.round(template.attrMult.vit * effLevel),
    int: Math.round(template.attrMult.int * effLevel),
    wil: Math.round(template.attrMult.wil * effLevel),
  }

  const stats = deriveStats(attrs)
  const maxSP = deriveMaxSP(attrs.wil)

  return {
    id: instanceId,
    name: template.name,
    side: 'enemy',
    unitClass: null,
    element: template.element,
    line: opts?.line ?? 'front',
    level: effLevel,
    stats,
    maxSP,
    currentHP: stats.maxHP,
    currentSP: maxSP,
    actionGauge: 0,
    alive: true,
    skills: [enemyBasicAttack(template)],
    keywords: [...(template.keywords ?? []), ...(opts?.keywords ?? [])],
    cp: combatPower(stats),
    targetTag: opts?.targetTag ?? template.id,
  }
}
