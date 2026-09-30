/**
 * Training Center (Layer 1 §2.4 — the Master's lever on auto-learn; Layer 3 facility row).
 *
 * A drill is a world-time timer on one hero: REFINE an owned skill (use-XP) or LEARN a
 * canon trainable skill (added at Lv1). Completion runs the same pure fold as combat
 * learning (awardSkillXp → resolveMerges), so a drill can finish a merge. The centre's
 * level sets refine speed (drill XP) and the highest grade it can teach.
 *
 * Canon: training ≠ leveling — no attribute, grade, hero-XP or level ever changes here.
 * PURE and DETERMINISTIC: no RNG; inputs never mutated.
 */

import { estateBusy } from '../estate/deploy'
import type { GameState, HeroId, OwnedHero, SkillGrade } from '../types'
import { SKILLS } from '../content'
import { TUNING } from '../tuning'
import { awardSkillXp, maxLevelFor, resolveMerges } from '../skills'
import { addMasterXp } from '../master'

const T = TUNING.skills.training
const GRADE_ORDER: SkillGrade[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'U']

function gradeRank(g: SkillGrade): number {
  return GRADE_ORDER.indexOf(g)
}

/** Highest grade the centre can train at `level` (null while unbuilt). */
export function maxTrainableGrade(level: number): SkillGrade | null {
  let best: SkillGrade | null = null
  for (const [lvl, grade] of Object.entries(T.maxGradeThresholds)) {
    if (level >= Number(lvl)) best = grade as SkillGrade
  }
  return best
}

/** Use-XP one refine drill grants at a centre level (refine speed). */
export function drillXp(level: number): number {
  return T.drillXpBase + T.drillXpPerLevel * Math.max(0, level - 1)
}

/** What a drill of `skillId` would be for this hero: refine (owned), learn (trainable), or neither. */
export function trainingMode(hero: OwnedHero, skillId: string): 'refine' | 'learn' | null {
  const def = SKILLS[skillId]
  if (!def) return null
  if (hero.skills.some((s) => s.id === skillId)) return 'refine'
  return def.trainable ? 'learn' : null
}

/** Gold for a drill. */
export function drillCost(skillId: string, mode: 'refine' | 'learn'): number {
  const def = SKILLS[skillId]!
  return T.drillGold[def.grade]! * (mode === 'learn' ? T.learnMult : 1)
}

/** Why a drill can't start right now (a readable reason), or null when it can. */
export function trainingRefusal(state: GameState, heroId: HeroId, skillId: string): string | null {
  const level = state.facilities.trainingCenter.level
  const ceiling = maxTrainableGrade(level)
  if (ceiling === null) return 'The Training Center is not built yet.'
  const hero = state.heroes[heroId]
  if (!hero || !hero.alive) return 'That hero has fallen.'
  if (hero.promotion !== null) return 'That hero is being promoted.'
  if (hero.training !== null) return 'That hero is already training.'
  if (hero.expedition) return 'That hero is away in the Ruins.'
  if (hero.captiveOf) return 'That hero is held captive.'
  if (estateBusy(state, heroId) === 'is out on a bounty') return 'That hero is out on a bounty.'
  const mode = trainingMode(hero, skillId)
  if (mode === null) return 'The Training Center cannot teach that skill.'
  const def = SKILLS[skillId]!
  if (gradeRank(def.grade) > gradeRank(ceiling)) return `Grade ${def.grade} is above this centre's ceiling (${ceiling}).`
  if (mode === 'refine') {
    const owned = hero.skills.find((s) => s.id === skillId)!
    if (owned.level >= maxLevelFor(def.grade)) return 'That skill is already at its max level.'
  }
  if (state.gold < drillCost(skillId, mode)) return 'Not enough gold.'
  return null
}

export function canTrain(state: GameState, heroId: HeroId, skillId: string): boolean {
  return trainingRefusal(state, heroId, skillId) === null
}

/** Start a drill: pay gold, set the world-time timer. Throws when refused. */
export function startTraining(state: GameState, heroId: HeroId, skillId: string, nowWorld: number): GameState {
  const refusal = trainingRefusal(state, heroId, skillId)
  if (refusal !== null) throw new Error(`startTraining: ${refusal}`)
  const hero = state.heroes[heroId]!
  const mode = trainingMode(hero, skillId)!
  return {
    ...state,
    gold: state.gold - drillCost(skillId, mode),
    heroes: {
      ...state.heroes,
      [heroId]: { ...hero, training: { skillId, mode, completesAtWorld: nowWorld + T.drillDurationMs } },
    },
  }
}

/** Resolve a hero's drill at the given centre level (no-op without one). */
export function completeTraining(hero: OwnedHero, centreLevel: number): OwnedHero {
  const drill = hero.training
  if (drill === null) return hero
  const learned =
    drill.mode === 'learn'
      ? hero.skills.some((s) => s.id === drill.skillId)
        ? hero.skills
        : [...hero.skills, { id: drill.skillId, level: 1, xp: 0 }]
      : awardSkillXp(hero.skills, { [drill.skillId]: drillXp(centreLevel) })
  return { ...hero, skills: resolveMerges(learned), training: null }
}

/** Gem pay-to-skip a drill in progress. */
export function skipTraining(state: GameState, heroId: HeroId): GameState {
  const hero = state.heroes[heroId]
  if (!hero || hero.training === null) throw new Error('skipTraining: no drill in progress')
  if (state.gems < T.skipGemCost) {
    throw new Error(`skipTraining: insufficient gems (have ${state.gems}, need ${T.skipGemCost})`)
  }
  const done = completeTraining(hero, state.facilities.trainingCenter.level)
  return {
    ...state,
    gems: state.gems - T.skipGemCost,
    heroes: { ...state.heroes, [heroId]: done },
    meta: addMasterXp(state.meta, TUNING.lobby.master.xpPerTrainingDrill),
  }
}

export interface TrainingOption {
  skillId: string
  mode: 'refine' | 'learn'
  cost: number
  ok: boolean
  reason: string | null
}

/** Every drill the UI could offer for a hero: owned skills to refine, then trainable skills to learn. */
export function trainingOptions(state: GameState, heroId: HeroId): TrainingOption[] {
  const hero = state.heroes[heroId]
  if (!hero) return []
  const ids = [
    ...hero.skills.map((s) => s.id).filter((id) => SKILLS[id] !== undefined),
    ...Object.keys(SKILLS).filter((id) => SKILLS[id]!.trainable && !hero.skills.some((s) => s.id === id)),
  ]
  return ids.map((skillId) => {
    const mode = trainingMode(hero, skillId)!
    const reason = trainingRefusal(state, heroId, skillId)
    return { skillId, mode, cost: drillCost(skillId, mode), ok: reason === null, reason }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Self-practice: heroes who spend free time in the yard work on a skill of their own
// choosing. Free and slower than a drill; a drill is the Master's way to focus them.
// ─────────────────────────────────────────────────────────────────────────────

const S = T.self

export interface PracticeFocus {
  skillId: string
  mode: 'refine' | 'learn'
}

const round3 = (v: number) => Math.round(v * 1000) / 1000

/** Owned skills are practised first while any is still below this level. */
const BASICS_LEVEL = 3

/** Small stable hash, so heroes don't all pick the same new skill. */
function pick<T>(items: readonly T[], key: string): T {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return items[h % items.length]!
}

/**
 * What a hero works on when they train on their own: their least-practised skill while
 * any is still rough (below Lv3), then a new skill the Training Center can teach, then
 * whatever owned skill still has room to grow. Null when there is nothing left.
 */
export function practiceFocus(hero: OwnedHero, centreLevel: number): PracticeFocus | null {
  const growing = hero.skills
    .filter((s) => SKILLS[s.id] !== undefined && s.level < maxLevelFor(SKILLS[s.id]!.grade))
    .sort((a, b) => a.level - b.level || gradeRank(SKILLS[b.id]!.grade) - gradeRank(SKILLS[a.id]!.grade) || a.id.localeCompare(b.id))
  const rough = growing[0]
  if (rough && rough.level < BASICS_LEVEL) return { skillId: rough.id, mode: 'refine' }
  const ceiling = maxTrainableGrade(centreLevel)
  if (ceiling !== null) {
    const teachable = Object.keys(SKILLS)
      .filter((id) => SKILLS[id]!.trainable && !hero.skills.some((s) => s.id === id) && gradeRank(SKILLS[id]!.grade) <= gradeRank(ceiling))
      .sort()
    if (teachable.length > 0) {
      const top = Math.max(...teachable.map((id) => gradeRank(SKILLS[id]!.grade)))
      return { skillId: pick(teachable.filter((id) => gradeRank(SKILLS[id]!.grade) === top), hero.id), mode: 'learn' }
    }
  }
  return rough ? { skillId: rough.id, mode: 'refine' } : null
}

/** Practice points one 'train' slot banks (instructors multiply it via `trainMult`). */
export function practiceRate(centreLevel: number, trainMult = 1): number {
  const centre = centreLevel > 0 ? 1 + S.perCentreLevel * (centreLevel - 1) : S.noCentreMult
  return S.perSlot * centre * trainMult
}

export interface PracticeResult {
  hero: OwnedHero
  practice: { skillId: string; points: number } | undefined
  /** What the session achieved: a skill level, a newly learned skill, or nothing yet. */
  gained: { kind: 'level' | 'learned'; skillId: string } | null
}

/** One slot of self-practice. Pure: returns the updated hero and practice record. */
export function practise(
  hero: OwnedHero,
  practice: { skillId: string; points: number } | undefined,
  centreLevel: number,
  trainMult = 1,
): PracticeResult {
  const focus = practiceFocus(hero, centreLevel)
  if (focus === null) return { hero, practice: undefined, gained: null }
  let points = (practice?.skillId === focus.skillId ? practice.points : 0) + practiceRate(centreLevel, trainMult)
  if (focus.mode === 'learn') {
    if (points < S.learnPoints) return { hero, practice: { skillId: focus.skillId, points: round3(points) }, gained: null }
    const skills = resolveMerges([...hero.skills, { id: focus.skillId, level: 1, xp: 0 }])
    return { hero: { ...hero, skills }, practice: undefined, gained: { kind: 'learned', skillId: focus.skillId } }
  }
  const whole = Math.floor(points)
  if (whole < 1) return { hero, practice: { skillId: focus.skillId, points: round3(points) }, gained: null }
  points -= whole
  const before = hero.skills.find((s) => s.id === focus.skillId)?.level ?? 0
  const skills = resolveMerges(awardSkillXp(hero.skills, { [focus.skillId]: whole }))
  const after = skills.find((s) => s.id === focus.skillId)?.level ?? 0
  return {
    hero: { ...hero, skills },
    practice: { skillId: focus.skillId, points: round3(points) },
    gained: after > before ? { kind: 'level', skillId: focus.skillId } : null,
  }
}
