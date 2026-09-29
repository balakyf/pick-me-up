/**
 * Transfer Station (bible "Transfer station — skill transfer"; Layer 1 §2.4 "crafted at
 * the Transfer Station"). Two instant, gold-paid actions:
 *
 *   Transfer — move a skill from one living hero to another. The donor forgets it; the
 *              recipient learns it at level − 1 (its full level from station Lv5), then
 *              merges resolve. This is how merge inputs are gathered on one hero.
 *   Fuse     — craft a merge recipe one level EARLIER than auto-merge, or run a
 *              manual-only evolution (max Pain Tolerance → Battle Speed, max Sword-Shield
 *              Technique → Intermediate Sword Technique).
 *
 * Bound skills (achievements) and conditional unlocks cannot be transferred — they are
 * the hero's own history. PURE and DETERMINISTIC: no RNG; inputs never mutated.
 */

import type { GameState, HeroId, HeroSkill, OwnedHero, SkillGrade } from '../types'
import { SKILLS, SKILL_EVOLUTIONS, SKILL_MERGES } from '../content'
import { TUNING } from '../tuning'
import { isConditionalSkill, maxLevelFor, resolveMerges } from '../skills'

const TR = TUNING.skills.transfer
const DRILL_GOLD = TUNING.skills.training.drillGold
const GRADE_ORDER: SkillGrade[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'U']

function gradeRank(g: SkillGrade): number {
  return GRADE_ORDER.indexOf(g)
}

/** Highest grade the station can move at `level` (null while unbuilt). */
export function maxTransferGrade(level: number): SkillGrade | null {
  let best: SkillGrade | null = null
  for (const [lvl, grade] of Object.entries(TR.maxGradeThresholds)) {
    if (level >= Number(lvl)) best = grade as SkillGrade
  }
  return best
}

/** Gold to transfer a skill. */
export function transferCost(skillId: string): number {
  const def = SKILLS[skillId]
  return def ? DRILL_GOLD[def.grade]! * TR.transferMult : 0
}

/** Gold to fuse/evolve into `result`. */
export function fuseCost(result: string): number {
  const def = SKILLS[result]
  return def ? DRILL_GOLD[def.grade]! * TR.fuseMult : 0
}

/** The level a transferred skill lands at. */
export function transferredLevel(donorLevel: number, stationLevel: number): number {
  return stationLevel >= TR.keepLevelAt ? donorLevel : Math.max(1, donorLevel - 1)
}

function busyReason(hero: OwnedHero | undefined, who: string): string | null {
  if (!hero || !hero.alive) return `The ${who} has fallen.`
  if (hero.promotion !== null) return `The ${who} is being promoted.`
  if (hero.training !== null) return `The ${who} is training.`
  return null
}

/** Why a transfer can't happen right now (a readable reason), or null when it can. */
export function transferRefusal(state: GameState, donorId: HeroId, recipientId: HeroId, skillId: string): string | null {
  const level = state.facilities.transferStation.level
  const ceiling = maxTransferGrade(level)
  if (ceiling === null) return 'The Transfer Station is not built yet.'
  if (donorId === recipientId) return 'Pick two different heroes.'
  const donor = state.heroes[donorId]
  const recipient = state.heroes[recipientId]
  const busy = busyReason(donor, 'donor') ?? busyReason(recipient, 'recipient')
  if (busy !== null) return busy
  const def = SKILLS[skillId]
  if (!def || !donor!.skills.some((s) => s.id === skillId)) return 'The donor does not know that skill.'
  if (def.bound === true || isConditionalSkill(skillId)) return `${def.name} is bound to its bearer.`
  if (recipient!.skills.some((s) => s.id === skillId)) return 'The recipient already knows it.'
  if (gradeRank(def.grade) > gradeRank(ceiling)) return `Grade ${def.grade} is above this station's ceiling (${ceiling}).`
  if (state.gold < transferCost(skillId)) return 'Not enough gold.'
  return null
}

/** Move a skill from donor to recipient. Throws when refused. PURE. */
export function transferSkill(state: GameState, donorId: HeroId, recipientId: HeroId, skillId: string): GameState {
  const refusal = transferRefusal(state, donorId, recipientId, skillId)
  if (refusal !== null) throw new Error(`transferSkill: ${refusal}`)
  const donor = state.heroes[donorId]!
  const recipient = state.heroes[recipientId]!
  const moved = donor.skills.find((s) => s.id === skillId)!
  const level = transferredLevel(moved.level, state.facilities.transferStation.level)
  const gained: HeroSkill[] = [...recipient.skills.map((s) => ({ ...s })), { id: skillId, level, xp: 0 }]
  return {
    ...state,
    gold: state.gold - transferCost(skillId),
    heroes: {
      ...state.heroes,
      [donorId]: { ...donor, skills: donor.skills.filter((s) => s.id !== skillId).map((s) => ({ ...s })) },
      [recipientId]: { ...recipient, skills: resolveMerges(gained) },
    },
  }
}

/** One craftable fusion for a hero (a merge taken early, or an evolution). */
export interface FuseOption {
  result: string
  kind: 'merge' | 'evolve'
  inputs: string[]
  cost: number
  ok: boolean
  reason: string | null
}

/** The recipe producing `result`, as a fuse option skeleton (null when none exists). */
function recipeFor(result: string): { kind: 'merge' | 'evolve'; inputs: string[]; minLevel: (id: string) => number } | null {
  const merge = SKILL_MERGES.find((r) => r.result === result)
  if (merge) {
    const need = Math.max(1, merge.minLevel - TR.earlyFuseLevels)
    return { kind: 'merge', inputs: [...merge.inputs], minLevel: () => need }
  }
  const evo = SKILL_EVOLUTIONS.find((r) => r.result === result)
  if (evo) {
    return { kind: 'evolve', inputs: [evo.from], minLevel: (id) => maxLevelFor(SKILLS[id]!.grade) }
  }
  return null
}

/** Why a fusion can't happen right now, or null when it can. */
export function fuseRefusal(state: GameState, heroId: HeroId, result: string): string | null {
  if (state.facilities.transferStation.level < 1) return 'The Transfer Station is not built yet.'
  const hero = state.heroes[heroId]
  const busy = busyReason(hero, 'hero')
  if (busy !== null) return busy
  const recipe = recipeFor(result)
  if (recipe === null) return 'No recipe makes that skill.'
  if (hero!.skills.some((s) => s.id === result)) return 'The hero already knows it.'
  for (const id of recipe.inputs) {
    const owned = hero!.skills.find((s) => s.id === id)
    const name = SKILLS[id]?.name ?? id
    if (!owned) return `Needs ${name}.`
    if (owned.level < recipe.minLevel(id)) return `${name} must reach Lv${recipe.minLevel(id)}.`
  }
  if (state.gold < fuseCost(result)) return 'Not enough gold.'
  return null
}

/** Fuse/evolve into `result`: the inputs are consumed, the result arrives at Lv1. Throws when refused. PURE. */
export function fuseSkill(state: GameState, heroId: HeroId, result: string): GameState {
  const refusal = fuseRefusal(state, heroId, result)
  if (refusal !== null) throw new Error(`fuseSkill: ${refusal}`)
  const hero = state.heroes[heroId]!
  const inputs = new Set(recipeFor(result)!.inputs)
  const skills = resolveMerges([
    ...hero.skills.filter((s) => !inputs.has(s.id)).map((s) => ({ ...s })),
    { id: result, level: 1, xp: 0 },
  ])
  return {
    ...state,
    gold: state.gold - fuseCost(result),
    heroes: { ...state.heroes, [heroId]: { ...hero, skills } },
  }
}

/** Every fusion a hero is working toward: recipes where it holds at least one input. */
export function fuseOptions(state: GameState, heroId: HeroId): FuseOption[] {
  const hero = state.heroes[heroId]
  if (!hero) return []
  const held = new Set(hero.skills.map((s) => s.id))
  const results = [...SKILL_MERGES.map((r) => r.result), ...SKILL_EVOLUTIONS.map((r) => r.result)]
  const out: FuseOption[] = []
  for (const result of results) {
    const recipe = recipeFor(result)!
    if (held.has(result) || !recipe.inputs.some((id) => held.has(id))) continue
    const reason = fuseRefusal(state, heroId, result)
    out.push({ result, kind: recipe.kind, inputs: recipe.inputs, cost: fuseCost(result), ok: reason === null, reason })
  }
  return out
}
