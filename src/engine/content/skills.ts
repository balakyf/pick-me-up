/**
 * Skill registry + merge recipes (Layer 1 §2). The combat sim synthesizes an
 * implicit basic attack for every unit, so a hero's skills are PURELY additive and
 * a cameo may legitimately have none ([]).
 *
 * Each entry is a static SkillDef: a grade (sets the level cap + CP weight) and a
 * level-1 `baseMult` that grows by `perLevel` as the hero casts it (auto-learn).
 * `baseMult` of the original five equals their pre-leveling `skillMult`, so a Lv1
 * cast hits exactly as before.
 *
 * `learnable: false` marks merge-only results (and their canon inputs) that a
 * promotion must not hand out — promotion keeps drawing from the original pool.
 * `trainable: true` marks the canon "trained" skills the Training Center can teach.
 *
 * Element `null` means "inherit the unit's element". Numbers are first-pass tuning
 * shapes; no logic lives here.
 */

import type { AchievementDef, EvolutionRecipe, HeroClass, MergeRecipe, SkillRegistry, SkillUnlock } from '../types'

export const SKILLS: SkillRegistry = {
  // ── Original innate pool (promotion-grantable) ────────────────────────────
  // Warrior single-target power strike (canon "Power Strike").
  power_strike: {
    id: 'power_strike',
    name: 'Power Strike',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 30,
    baseMult: 1.6,
    perLevel: 0.08,
    trainable: false,
    learnable: true,
  },
  // Spear thrust hitting a single front target hard (Muden's "Spear" flavor).
  piercing_thrust: {
    id: 'piercing_thrust',
    name: 'Piercing Thrust',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 35,
    baseMult: 1.7,
    perLevel: 0.08,
    trainable: false,
    learnable: true,
  },
  // Thief multi-strike flurry (King's-Eyes scout flavor).
  shadow_flurry: {
    id: 'shadow_flurry',
    name: 'Shadow Flurry',
    grade: 'D',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 25,
    baseMult: 1.25,
    perLevel: 0.06,
    trainable: false,
    learnable: true,
  },
  // Archer lightning volley vs all enemies (Nihaku "Thunderbringer").
  thunder_volley: {
    id: 'thunder_volley',
    name: 'Thunder Volley',
    grade: 'B',
    damageType: 'physical',
    element: 'wind',
    target: 'all-enemies',
    spCost: 45,
    baseMult: 0.9,
    perLevel: 0.05,
    trainable: false,
    learnable: true,
  },
  // Mage elemental nuke vs all enemies.
  arcane_burst: {
    id: 'arcane_burst',
    name: 'Arcane Burst',
    grade: 'B',
    damageType: 'magic',
    element: null,
    target: 'all-enemies',
    spCost: 50,
    baseMult: 1.4,
    perLevel: 0.07,
    trainable: false,
    learnable: true,
  },

  // ── Canon trained skills (merge inputs; Islat Han's kit) ──────────────────
  basic_swordsmanship: {
    id: 'basic_swordsmanship',
    name: 'Basic Swordsmanship',
    grade: 'E',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 10,
    baseMult: 1.15,
    perLevel: 0.05,
    trainable: true,
    learnable: false,
  },
  basic_shield: {
    id: 'basic_shield',
    name: 'Basic Shield',
    grade: 'E',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 10,
    baseMult: 1.1,
    perLevel: 0.04,
    trainable: true,
    learnable: false,
  },
  // Berserk: +power, loses rationality (canon Lv1-6, +10 stat bonus flavor).
  berserk: {
    id: 'berserk',
    name: 'Berserk',
    grade: 'D',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 20,
    baseMult: 1.35,
    perLevel: 0.06,
    trainable: true,
    learnable: false,
  },
  // Composure: a measured, precise strike (canon: learned by synthesizing Tobi).
  composure: {
    id: 'composure',
    name: 'Composure',
    grade: 'D',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 15,
    baseMult: 1.2,
    perLevel: 0.05,
    trainable: true,
    learnable: false,
  },
  calmness: {
    id: 'calmness',
    name: 'Calmness',
    grade: 'D',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 15,
    baseMult: 1.2,
    perLevel: 0.05,
    trainable: true,
    learnable: false,
  },
  sword_soul: {
    id: 'sword_soul',
    name: 'Sword Soul',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 25,
    baseMult: 1.45,
    perLevel: 0.07,
    trainable: true,
    learnable: false,
  },
  // Ganggyeok (강격): a crushing heavy blow.
  ganggyeok: {
    id: 'ganggyeok',
    name: 'Ganggyeok',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 28,
    baseMult: 1.5,
    perLevel: 0.07,
    trainable: true,
    learnable: false,
  },

  // ── Canon trained passives (never cast; resolved at unit build) ───────────
  // Pain Tolerance (1-5): shrugs off a share of every hit. Max + evolve → Battle Speed.
  pain_tolerance: {
    id: 'pain_tolerance',
    name: 'Pain Tolerance',
    grade: 'E',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 0,
    baseMult: 0,
    perLevel: 0,
    trainable: true,
    learnable: false,
    passive: { kind: 'guard', base: 0.04, perLevel: 0.02 },
  },
  // Insight (1-5): reads openings — more critical hits.
  insight: {
    id: 'insight',
    name: 'Insight',
    grade: 'D',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 0,
    baseMult: 0,
    perLevel: 0,
    trainable: true,
    learnable: false,
    passive: { kind: 'stat', stat: 'critPct', base: 0.15, perLevel: 0.08 },
  },
  // Flame Resistance (1-3).
  flame_resistance: {
    id: 'flame_resistance',
    name: 'Flame Resistance',
    grade: 'E',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 0,
    baseMult: 0,
    perLevel: 0,
    trainable: true,
    learnable: false,
    passive: { kind: 'guard', base: 0.15, perLevel: 0.08, vs: 'fire' },
  },

  // ── Conditional unlocks (canon Lv11 / Lv15 / Lv29 skills) ─────────────────
  // Projectile/Throwing Defense (1-3): canon Lv11 skill, confirmed on floor 10.
  projectile_defense: {
    id: 'projectile_defense',
    name: 'Throwing Defense',
    grade: 'E',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 0,
    baseMult: 0,
    perLevel: 0,
    trainable: true,
    learnable: false,
    passive: { kind: 'guard', base: 0.12, perLevel: 0.06, vs: 'ranged' },
  },
  // Siman: canon Lv15 skill, seen on floor 15 — a decisive single cut.
  siman: {
    id: 'siman',
    name: 'Siman',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 32,
    baseMult: 1.75,
    perLevel: 0.09,
    trainable: false,
    learnable: false,
  },
  // Incident: canon Lv29 skill — a sweeping strike across the whole enemy line.
  incident: {
    id: 'incident',
    name: 'Incident',
    grade: 'B',
    damageType: 'physical',
    element: null,
    target: 'all-enemies',
    spCost: 48,
    baseMult: 1.05,
    perLevel: 0.06,
    trainable: false,
    learnable: false,
  },

  // ── Achievement skills (bound: never trained, transferred or copied) ──────
  // Dragon Slayer / Dragon Sal: earned by slaying Halgiraf — bonus vs dragons.
  dragon_slayer: {
    id: 'dragon_slayer',
    name: 'Dragon Slayer',
    grade: 'B',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 0,
    baseMult: 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    bound: true,
    passive: { kind: 'bane', family: 'dragon', base: 0.3, perLevel: 0.1 },
  },
  // Guardian's Oath: earned by bringing Princess Priasis through the F15 escort.
  guardians_oath: {
    id: 'guardians_oath',
    name: "Guardian's Oath",
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 0,
    baseMult: 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    bound: true,
    passive: { kind: 'guard', base: 0.06, perLevel: 0.02 },
  },

  // ── Merge results ─────────────────────────────────────────────────────────
  sword_shield_technique: {
    id: 'sword_shield_technique',
    name: 'Sword-Shield Technique',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 25,
    baseMult: 1.55,
    perLevel: 0.07,
    trainable: false,
    learnable: false,
  },
  // Berserk + Composure → Exceed (canon, Islat Han).
  exceed: {
    id: 'exceed',
    name: 'Exceed',
    grade: 'B',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 35,
    baseMult: 1.9,
    perLevel: 0.09,
    trainable: false,
    learnable: false,
  },
  // Berserk + Calmness → Ixid (canon B+, Unique): consumes vitality; can kill at max.
  ixid: {
    id: 'ixid',
    name: 'Ixid',
    grade: 'A',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 20,
    baseMult: 2.6,
    perLevel: 0.15,
    hpCost: 18,
    hpCostPerLevel: 10,
    trainable: false,
    learnable: false,
  },
  // Sword Soul + Ganggyeok → Pathology (canon B, Unique): fixed damage, self-damage.
  pathology: {
    id: 'pathology',
    name: 'Pathology',
    grade: 'A',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 25,
    baseMult: 2.8,
    perLevel: 0.15,
    hpCost: 22,
    hpCostPerLevel: 12,
    trainable: false,
    learnable: false,
  },

  // ── Evolutions (manual, at the Transfer Station) ──────────────────────────
  // Max Pain Tolerance → Battle Speed (canon Lv1).
  battle_speed: {
    id: 'battle_speed',
    name: 'Battle Speed',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 0,
    baseMult: 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    passive: { kind: 'stat', stat: 'spd', base: 0.08, perLevel: 0.03 },
  },
  // Sword-Shield Technique → Intermediate Sword Technique (canon).
  intermediate_sword: {
    id: 'intermediate_sword',
    name: 'Intermediate Sword Technique',
    grade: 'B',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 30,
    baseMult: 1.85,
    perLevel: 0.09,
    trainable: false,
    learnable: false,
  },
}

/** Auto-merge table (Layer 1 §2.4). Order is the deterministic resolution order. */
export const SKILL_MERGES: readonly MergeRecipe[] = [
  { inputs: ['berserk', 'composure'], minLevel: 3, result: 'exceed' },
  { inputs: ['berserk', 'calmness'], minLevel: 3, result: 'ixid' },
  { inputs: ['sword_soul', 'ganggyeok'], minLevel: 3, result: 'pathology' },
  { inputs: ['basic_swordsmanship', 'basic_shield'], minLevel: 3, result: 'sword_shield_technique' },
]

/** Manual-only evolutions (Transfer Station): `from` at max level → `result` at Lv1. */
export const SKILL_EVOLUTIONS: readonly EvolutionRecipe[] = [
  { from: 'pain_tolerance', result: 'battle_speed' },
  { from: 'sword_shield_technique', result: 'intermediate_sword' },
]

/** Conditional unlocks (canon: Throwing Defense Lv11 · Siman Lv15 on F15 · Incident Lv29). */
export const SKILL_UNLOCKS: readonly SkillUnlock[] = [
  { skillId: 'projectile_defense', minLevel: 11 },
  { skillId: 'siman', minLevel: 15, minFloorCleared: 15 },
  { skillId: 'incident', minLevel: 29 },
]

/** Achievement skills, earned by every deployed survivor of a won battle that meets the condition. */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'slay_halgiraf', skillId: 'dragon_slayer', label: 'Slew Halgiraf', condition: { kind: 'defeat', targetTag: 'halgiraf' } },
  { id: 'escort_priasis', skillId: 'guardians_oath', label: 'Brought Priasis home', condition: { kind: 'clearFloor', floor: 15 } },
]

/** Each class's signature skill — promotion grants it first, and 4★+ summons arrive with it. */
export const CLASS_SKILL: Readonly<Record<HeroClass, string>> = {
  warrior: 'power_strike',
  spearman: 'piercing_thrust',
  thief: 'shadow_flurry',
  archer: 'thunder_volley',
  mage: 'arcane_burst',
}
