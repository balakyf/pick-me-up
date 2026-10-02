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
  HeroSkill,
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
import { passiveBonuses, resolveSkillEffect, skillCp } from '../skills'
import { engravingCp, engravingEffect } from '../engravings'
import { favorStatMult, isDefiant } from '../favor'
import { TUNING } from '../tuning'

/** Apply relative % bonuses to a stat block (rounded; CRIT re-capped). */
function applyStatPct(stats: DerivedStats, pct: Partial<Record<keyof DerivedStats, number>>): DerivedStats {
  const out = { ...stats }
  for (const key of Object.keys(pct) as (keyof DerivedStats)[]) {
    const p = pct[key]
    if (p !== undefined && p !== 0) out[key] = Math.round(out[key] * (1 + p))
  }
  out.critPct = Math.min(out.critPct, TUNING.stats.derived.critCap)
  return out
}

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
 * Resolve a list of skill ids against a registry into their Lv1 SkillEffect
 * blocks. Unknown ids are silently skipped (an authored cameo may reference a
 * skill not present in the registry, and a cameo may have none at all).
 * Order is preserved.
 */
export function resolveSkills(skillIds: string[], registry: SkillRegistry): SkillEffect[] {
  return resolveHeroSkills(
    skillIds.map((id) => ({ id, level: 1, xp: 0 })),
    registry,
  )
}

/** Resolve a hero's leveled skills into the SkillEffects the sim reads (order kept). */
export function resolveHeroSkills(skills: readonly HeroSkill[], registry: SkillRegistry): SkillEffect[] {
  const out: SkillEffect[] = []
  for (const s of skills) {
    const effect = resolveSkillEffect(s, registry)
    if (effect !== null) out.push(effect)
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
 * attack followed by the hero's leveled skills. CP is the display CP of the
 * derived stats plus the skills' CP term. sourceHeroId links back to the OwnedHero for XP and
 * permadeath bookkeeping after the battle.
 */
export function buildCombatUnit(
  hero: OwnedHero,
  line: Line,
  registry: SkillRegistry = {},
  inventory: readonly EquipmentItem[] = [],
): CombatUnit {
  const level = hero.xp.level
  // Engraving + passive skills: keyword tags and relative stat bonuses (Layer 1 §2/§5.4).
  const engraving = engravingEffect(hero.engraving)
  const passives = passiveBonuses(hero.skills, registry)
  const pct: Partial<Record<keyof DerivedStats, number>> = { ...passives.statPct }
  for (const [k, v] of Object.entries(engraving?.statPct ?? {}) as [keyof DerivedStats, number][]) {
    pct[k] = (pct[k] ?? 0) + v
  }
  // Favor (Layer 3 §C1): a warm bond lifts every stat a little; a Wary hero is sluggish.
  const favorMult = favorStatMult(hero.favor ?? TUNING.favor.start)
  if (favorMult !== 1) {
    for (const k of ['maxHP', 'pAtk', 'mAtk', 'pDef', 'mDef', 'spd'] as const) pct[k] = (pct[k] ?? 0) + (favorMult - 1)
  }
  // Low Sanity weakens the hero BEFORE the snapshot freezes (combat never recomputes).
  const base = applyStatPct(applySanityPenalty(deriveStatsForHero(hero, level), hero.sanity), pct)
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
    skills: [basicAttackFor(hero, element), ...resolveHeroSkills(hero.skills, registry)],
    keywords: [
      ...gear.keywords,
      ...(engraving?.keywords ?? []),
      ...passives.keywords,
      // Guarantee an action (Layer 3 §D2): a blessed hero's first strike lands hard.
      ...(hero.blessed ? [{ kind: 'opener' as const, multiplier: TUNING.intervention.guaranteeMult }] : []),
    ],
    // Skills add a CP term (Layer 1 §2.5): Σ gradeValue × level, weighted; an engraving adds its own.
    cp: combatPower(stats, skillCp(hero.skills, registry) + engravingCp(hero.engraving)),
    sourceHeroId: hero.id,
    // Carried for the combat panic check; enemies have no Sanity (field absent).
    sanity: hero.sanity,
    // A Wary hero ignores the Master's focus directive.
    ...(isDefiant(hero.favor ?? TUNING.favor.start) ? { defiant: true } : {}),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EnemyTemplate → CombatUnit
// ─────────────────────────────────────────────────────────────────────────────

/** The skill id of a caster enemy's basic attack (the replay shows it as a Spell). */
export const ENEMY_SPELL_ID = 'e_spell'

/**
 * The implicit basic attack every enemy fights with: a single physical Strike — or, for
 * a caster template (Order Battlemage, Kurushahr, a Wraith…), a Spell: magic damage from
 * its mAtk against the target's mDef, so a hero's WIL and magic guards matter.
 */
export function enemyBasicAttack(template: EnemyTemplate): SkillEffect {
  const caster = template.caster === true
  return {
    id: caster ? ENEMY_SPELL_ID : 'e_basic',
    name: caster ? 'Spell' : 'Strike',
    skillMult: 1.0,
    damageType: caster ? 'magic' : 'physical',
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
    /** Elite multiplier on every attribute (late floors meet their budget this way). */
    powerMult?: number
  },
): CombatUnit {
  const effLevel = level + (opts?.levelBonus ?? 0)
  const k = effLevel * (opts?.powerMult ?? 1)

  const attrs: PrimaryAttrs = {
    str: Math.round(template.attrMult.str * k),
    agi: Math.round(template.attrMult.agi * k),
    vit: Math.round(template.attrMult.vit * k),
    int: Math.round(template.attrMult.int * k),
    wil: Math.round(template.attrMult.wil * k),
  }

  const stats = deriveStats(attrs)
  const maxSP = deriveMaxSP(attrs.wil)

  return {
    id: instanceId,
    name: template.name,
    side: 'enemy',
    // A template may pick a targeting profile (e.g. assassins strike the weakest).
    unitClass: template.unitClass ?? null,
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
    ...(template.family !== undefined ? { family: template.family } : {}),
    templateId: template.id,
  }
}

/**
 * Build a hero-side mission NPC (e.g. the F15 escort target) from an ally template:
 * the same statline rules as an enemy, fielded on the party's side, flagged `isNpc`
 * (targetable, never acts, never part of the party's XP/permadeath bookkeeping).
 */
export function buildAllyUnit(
  template: EnemyTemplate,
  level: number,
  instanceId: string,
  opts: { line: Line; targetTag: string; levelBonus?: number },
): CombatUnit {
  const base = buildEnemyUnit(template, level, instanceId, {
    line: opts.line,
    levelBonus: opts.levelBonus,
    targetTag: opts.targetTag,
  })
  return { ...base, side: 'hero', unitClass: null, isNpc: true }
}
