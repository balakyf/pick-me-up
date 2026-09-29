/**
 * Skills (Layer 1 §2) — grade, level, auto-learn, merges, CP feed.
 *
 * A hero's skills are HeroSkill records ({ id, level, xp }) resolved against the
 * authored SKILLS registry. Leveling happens only in the pure post-combat fold
 * (tower/daily): every cast of an authored skill is one use-XP; skills level up to
 * their grade cap; both inputs of a merge recipe at minLevel fuse into the result.
 *
 * PURE and DETERMINISTIC: no RNG, integer/lookup math only, inputs never mutated.
 */

import type {
  DerivedStats,
  HeroClass,
  HeroId,
  HeroSkill,
  KeywordTag,
  MergeRecipe,
  SkillDef,
  SkillEffect,
  SkillGrade,
  SkillProgress,
  SkillRegistry,
} from '../types'
import { ACHIEVEMENTS, CLASS_SKILL, SKILLS, SKILL_MERGES, SKILL_UNLOCKS } from '../content'
import { TUNING } from '../tuning'

const T = TUNING.skills

export function maxLevelFor(grade: SkillGrade): number {
  return T.maxLevel[grade]!
}

function clampLevel(def: SkillDef, level: number): number {
  return Math.max(1, Math.min(maxLevelFor(def.grade), level))
}

/** skillMult at a level: baseMult + perLevel × (level − 1), level clamped to the grade cap. */
export function skillMultAt(def: SkillDef, level: number): number {
  const l = clampLevel(def, level)
  return Math.round((def.baseMult + def.perLevel * (l - 1)) * 1000) / 1000
}

/** HP paid per cast at a level (0 for ordinary skills). */
export function hpCostAt(def: SkillDef, level: number): number {
  if (def.hpCost === undefined) return 0
  return def.hpCost + (def.hpCostPerLevel ?? 0) * (clampLevel(def, level) - 1)
}

/** Is this a passive skill (never cast)? */
export function isPassive(id: string, registry: SkillRegistry = SKILLS): boolean {
  return registry[id]?.passive !== undefined
}

/** A passive's magnitude at a level: base + perLevel × (level − 1), level clamped. */
export function passiveMagnitude(def: SkillDef, level: number): number {
  const p = def.passive
  if (p === undefined) return 0
  return Math.round((p.base + p.perLevel * (clampLevel(def, level) - 1)) * 1000) / 1000
}

/**
 * The keywords and % stat bonuses a hero's passive skills lend its unit (Layer 1 §2.1):
 * guard → `guard` keyword, bane → `bane` keyword, stat → a relative % bonus. PURE.
 */
export function passiveBonuses(
  skills: readonly HeroSkill[],
  registry: SkillRegistry = SKILLS,
): { keywords: KeywordTag[]; statPct: Partial<Record<keyof DerivedStats, number>> } {
  const keywords: KeywordTag[] = []
  const statPct: Partial<Record<keyof DerivedStats, number>> = {}
  for (const s of skills) {
    const def = registry[s.id]
    const p = def?.passive
    if (def === undefined || p === undefined) continue
    const m = passiveMagnitude(def, s.level)
    if (p.kind === 'guard') {
      keywords.push(p.vs === undefined ? { kind: 'guard', reduction: m } : { kind: 'guard', reduction: m, vs: p.vs })
    } else if (p.kind === 'bane') {
      keywords.push({ kind: 'bane', family: p.family, multiplier: Math.round((1 + m) * 1000) / 1000 })
    } else {
      statPct[p.stat] = (statPct[p.stat] ?? 0) + m
    }
  }
  return { keywords, statPct }
}

/** The leveled effect the combat sim reads; null for an unknown id or a passive (never cast). */
export function resolveSkillEffect(skill: HeroSkill, registry: SkillRegistry = SKILLS): SkillEffect | null {
  const def = registry[skill.id]
  if (def === undefined || def.passive !== undefined) return null
  const effect: SkillEffect = {
    id: def.id,
    name: def.name,
    skillMult: skillMultAt(def, skill.level),
    damageType: def.damageType,
    element: def.element,
    target: def.target,
    spCost: def.spCost,
  }
  const hp = hpCostAt(def, skill.level)
  if (hp > 0) effect.hpCost = hp
  return effect
}

/** Mint a freshly owned hero's skills from innate ids (Lv1, no XP); unknown ids dropped. */
export function heroSkillsFromIds(ids: readonly string[], registry: SkillRegistry = SKILLS): HeroSkill[] {
  return ids.filter((id) => registry[id] !== undefined).map((id) => ({ id, level: 1, xp: 0 }))
}

/**
 * Auto-learn: add one use-XP per cast and carry level-ups up to the grade cap.
 * Excess XP rolls into the next level; a capped skill banks no XP.
 */
export function awardSkillXp(
  skills: readonly HeroSkill[],
  casts: Readonly<Record<string, number>>,
  registry: SkillRegistry = SKILLS,
): HeroSkill[] {
  return skills.map((s) => {
    const n = casts[s.id] ?? 0
    const def = registry[s.id]
    if (n <= 0 || def === undefined) return { ...s }
    const cap = maxLevelFor(def.grade)
    let level = s.level
    let xp = s.xp + n
    while (level < cap && xp >= T.xpToNext[level]!) {
      xp -= T.xpToNext[level]!
      level++
    }
    if (level >= cap) xp = 0
    return { id: s.id, level, xp }
  })
}

/**
 * Auto-merge: for each recipe in table order whose BOTH inputs are held at
 * ≥ minLevel, remove the inputs and append the result at Lv1. An input consumed by
 * an earlier recipe is gone for later ones; a result made this pass never feeds
 * another merge (the table has no chains). A result the hero already holds is skipped.
 */
export function resolveMerges(skills: readonly HeroSkill[], recipes: readonly MergeRecipe[] = SKILL_MERGES): HeroSkill[] {
  let out = skills.map((s) => ({ ...s }))
  for (const r of recipes) {
    const [a, b] = r.inputs
    const sa = out.find((s) => s.id === a)
    const sb = out.find((s) => s.id === b)
    if (!sa || !sb || sa.level < r.minLevel || sb.level < r.minLevel) continue
    if (out.some((s) => s.id === r.result)) continue
    out = out.filter((s) => s.id !== a && s.id !== b)
    out.push({ id: r.result, level: 1, xp: 0 })
  }
  return out
}

/** Σ gradeValue[grade] × level over known skills. */
export function skillScore(skills: readonly HeroSkill[], registry: SkillRegistry = SKILLS): number {
  let score = 0
  for (const s of skills) {
    const def = registry[s.id]
    if (def) score += T.gradeValue[def.grade]! * s.level
  }
  return score
}

/** The CP a hero's skills add to its unit (Layer 1 §2.5). */
export function skillCp(skills: readonly HeroSkill[], registry: SkillRegistry = SKILLS): number {
  return Math.round(skillScore(skills, registry) * T.cpPerSkillScore)
}

/**
 * Conditional unlocks (Layer 1 §2.2): add every SKILL_UNLOCKS skill whose level (and
 * floor) threshold the hero now meets and that it does not hold. Table order; Lv1.
 */
export function applyUnlocks(skills: readonly HeroSkill[], heroLevel: number, highestCleared: number): HeroSkill[] {
  const out = skills.map((s) => ({ ...s }))
  for (const u of SKILL_UNLOCKS) {
    if (heroLevel < u.minLevel) continue
    if (u.minFloorCleared !== undefined && highestCleared < u.minFloorCleared) continue
    if (out.some((s) => s.id === u.skillId)) continue
    out.push({ id: u.skillId, level: 1, xp: 0 })
  }
  return out
}

/** Did a won battle meet an achievement's condition? */
export function achievementsEarned(won: boolean, floor: number | undefined, defeatedTargetTags: readonly string[]): string[] {
  if (!won) return []
  return ACHIEVEMENTS.filter((a) =>
    a.condition.kind === 'defeat' ? defeatedTargetTags.includes(a.condition.targetTag) : a.condition.floor === floor,
  ).map((a) => a.skillId)
}

/** Is this skill granted by a condition (unlock or achievement) rather than learned? */
export function isConditionalSkill(id: string): boolean {
  return SKILL_UNLOCKS.some((u) => u.skillId === id) || ACHIEVEMENTS.some((a) => a.skillId === id)
}

/** Level-ups, merges, unlocks and achievements between two snapshots of one hero's skills (for results UI). */
export function diffSkills(
  heroId: HeroId,
  before: readonly HeroSkill[],
  after: readonly HeroSkill[],
  recipes: readonly MergeRecipe[] = SKILL_MERGES,
): SkillProgress[] {
  const out: SkillProgress[] = []
  const prev = new Map(before.map((s) => [s.id, s]))
  for (const s of after) {
    const old = prev.get(s.id)
    if (old) {
      if (s.level > old.level) out.push({ kind: 'level-up', heroId, skillId: s.id, level: s.level })
      continue
    }
    const recipe = recipes.find((r) => r.result === s.id)
    if (recipe) out.push({ kind: 'merge', heroId, skillId: s.id, from: recipe.inputs })
    else if (ACHIEVEMENTS.some((a) => a.skillId === s.id)) out.push({ kind: 'achievement', heroId, skillId: s.id })
    else if (SKILL_UNLOCKS.some((u) => u.skillId === s.id)) out.push({ kind: 'unlock', heroId, skillId: s.id })
  }
  return out
}

/** Skills a promotion may grant, in registry order (the original innate pool). */
export function learnableSkillIds(registry: SkillRegistry = SKILLS): string[] {
  return Object.keys(registry).filter((id) => registry[id]!.learnable)
}

/**
 * The skills a promotion may grant this hero, in priority order: its class's signature
 * skill first (when it lacks it), else every learnable skill it lacks.
 */
export function promotionSkillPool(heroClass: HeroClass | null, known: ReadonlySet<string>): string[] {
  const signature = heroClass !== null ? CLASS_SKILL[heroClass] : undefined
  if (signature !== undefined && !known.has(signature)) return [signature]
  return learnableSkillIds().filter((id) => !known.has(id))
}

/** What the post-combat fold needs to know beyond the casts. */
export interface FoldContext {
  /** The hero's level AFTER this battle's XP (for conditional unlocks). */
  heroLevel: number
  /** The account's highest cleared floor after this battle. */
  highestCleared: number
  /** Did the battle end in a win? (Achievements need one.) */
  won: boolean
  /** The tower floor fought (achievement conditions); undefined off-tower. */
  floor?: number
  defeatedTargetTags: readonly string[]
}

/**
 * The post-combat skill fold for one surviving hero (tower + daily): award use-XP
 * for this battle's casts (+ a flat per-battle XP to every passive), resolve merges,
 * then add conditional unlocks and achievement skills. Returns the new skills and
 * the milestones reached (for the results screen).
 */
export function foldBattleSkills(
  heroId: HeroId,
  skills: readonly HeroSkill[],
  casts: Readonly<Record<string, number>> | undefined,
  ctx?: FoldContext,
): { skills: HeroSkill[]; progress: SkillProgress[] } {
  const xp: Record<string, number> = { ...(casts ?? {}) }
  for (const s of skills) if (isPassive(s.id)) xp[s.id] = (xp[s.id] ?? 0) + T.passiveXpPerBattle
  let next = resolveMerges(awardSkillXp(skills, xp))
  if (ctx !== undefined) {
    next = applyUnlocks(next, ctx.heroLevel, ctx.highestCleared)
    for (const id of achievementsEarned(ctx.won, ctx.floor, ctx.defeatedTargetTags)) {
      if (!next.some((s) => s.id === id)) next.push({ id, level: 1, xp: 0 })
    }
  }
  return { skills: next, progress: diffSkills(heroId, skills, next) }
}
